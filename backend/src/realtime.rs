use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        Path, Query,
    },
    response::Response,
};
use serde::Deserialize;
use std::net::SocketAddr;
use std::sync::{Arc, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tokio::task::JoinHandle;

/// リアルタイムモニタリングのデータチャネル(FR-RT-00/01)。
///
/// コネクタ SPI: すべてのデータソースは `Connector` を実装するプラグインとする。
/// 第1弾は模擬データジェネレータ(MockConnector)。Modbus / REST / MQTT 等は
/// 同じ trait の実装として後から追加する(read / write / subscribe の capability 宣言)。
/// FE は WebSocket(/api/channels/{id}/stream)経由で正規化された Sample を受け取る。

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Sample {
    pub value: f64,
    pub ts_ms: u128,
}

/// データソースのプラグイン契約。subscribe(定期サンプリング)capability を持つ。
pub trait Connector: Send + Sync {
    /// 次のサンプル値を返す
    fn sample(&self) -> f64;
    /// 推奨サンプリング間隔
    fn interval(&self) -> Duration;
}

/// 模擬データジェネレータ。[min,max] をサイン波 + 時刻ジッタで往復する(rand 非依存)
pub struct MockConnector {
    pub min: f64,
    pub max: f64,
    pub interval_ms: u64,
}

fn now_ms() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0)
}

impl Connector for MockConnector {
    fn sample(&self) -> f64 {
        let t = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_secs_f64())
            .unwrap_or(0.0);
        // サイン波で [0,1] を作り [min,max] に写像。微小ジッタを加える
        let phase = ((t * 0.8).sin() * 0.5 + 0.5).clamp(0.0, 1.0);
        let jitter = ((t * 7.0).sin() * 0.5 + 0.5) * 0.05;
        self.min + (self.max - self.min) * (phase * 0.95 + jitter)
    }
    fn interval(&self) -> Duration {
        Duration::from_millis(self.interval_ms.max(200))
    }
}

/// Modbus/TCP コネクタ(FR-RT-02)。コネクタ SPI の実証実装。
///
/// `Connector::sample()` は同期だが Modbus I/O は非同期のため、バックグラウンドの
/// tokio タスクが保持レジスタを定期ポーリングし、最新値を `Arc<Mutex<f64>>` にキャッシュする。
/// `sample()` はそのキャッシュを返すだけ。Drop でポーリングタスクを停止する。
/// 初回ポーリング前・接続失敗時はキャッシュが NaN のままで、ストリームはその tick を送出しない。
pub struct ModbusConnector {
    latest: Arc<Mutex<f64>>,
    interval_ms: u64,
    task: JoinHandle<()>,
}

impl ModbusConnector {
    pub fn connect(
        addr: SocketAddr,
        unit: u8,
        register: u16,
        scale: f64,
        interval_ms: u64,
    ) -> Self {
        let latest = Arc::new(Mutex::new(f64::NAN));
        let task = tokio::spawn(poll_modbus(
            addr,
            unit,
            register,
            scale,
            interval_ms.max(200),
            latest.clone(),
        ));
        Self { latest, interval_ms, task }
    }
}

/// 保持レジスタを定期ポーリングして最新値(スケール適用後)をキャッシュに書く
async fn poll_modbus(
    addr: SocketAddr,
    unit: u8,
    register: u16,
    scale: f64,
    interval_ms: u64,
    latest: Arc<Mutex<f64>>,
) {
    use tokio_modbus::prelude::{Reader, Slave};
    let mut ctx = match tokio_modbus::client::tcp::connect_slave(addr, Slave(unit)).await {
        Ok(ctx) => ctx,
        Err(_) => return, // 接続失敗: キャッシュは NaN のまま(ストリームは無送出)
    };
    let mut ticker = tokio::time::interval(Duration::from_millis(interval_ms));
    loop {
        ticker.tick().await;
        // 例外応答 / I/O エラー時は直近値を保持して次の tick を待つ
        if let Ok(Ok(regs)) = ctx.read_holding_registers(register, 1).await
            && let Some(&raw) = regs.first()
            && let Ok(mut slot) = latest.lock()
        {
            *slot = raw as f64 * scale;
        }
    }
}

impl Connector for ModbusConnector {
    fn sample(&self) -> f64 {
        self.latest.lock().map(|v| *v).unwrap_or(f64::NAN)
    }
    fn interval(&self) -> Duration {
        Duration::from_millis(self.interval_ms.max(200))
    }
}

impl Drop for ModbusConnector {
    fn drop(&mut self) {
        self.task.abort();
    }
}

#[derive(Deserialize)]
pub struct ChannelParams {
    pub min: Option<f64>,
    pub max: Option<f64>,
    pub interval: Option<u64>,
    /// コネクタ種別: "mock"(既定)| "modbus"
    pub kind: Option<String>,
    /// Modbus: 接続先 "host:port"(例 "127.0.0.1:5502")
    pub host: Option<String>,
    /// Modbus: ユニット ID(スレーブアドレス)
    pub unit: Option<u8>,
    /// Modbus: 読み出す保持レジスタ番号
    pub register: Option<u16>,
    /// Modbus: 生レジスタ値に掛けるスケール(既定 1.0)
    pub scale: Option<f64>,
}

/// チャネル ID + パラメータからコネクタを解決する。
/// kind=modbus かつ host が解決できれば Modbus、それ以外は MockConnector。
pub fn resolve_connector(_channel_id: &str, params: &ChannelParams) -> Box<dyn Connector> {
    if params.kind.as_deref() == Some("modbus")
        && let Some(addr) = params.host.as_ref().and_then(|h| h.parse::<SocketAddr>().ok()) {
            return Box::new(ModbusConnector::connect(
                addr,
                params.unit.unwrap_or(1),
                params.register.unwrap_or(0),
                params.scale.unwrap_or(1.0),
                params.interval.unwrap_or(1000),
            ));
        }
    Box::new(MockConnector {
        min: params.min.unwrap_or(0.0),
        max: params.max.unwrap_or(100.0),
        interval_ms: params.interval.unwrap_or(1000),
    })
}

/// GET /api/channels/{id}/stream?min=&max=&interval= — WebSocket でサンプルを配信する
pub async fn channel_stream(
    ws: WebSocketUpgrade,
    Path(channel_id): Path<String>,
    Query(params): Query<ChannelParams>,
) -> Response {
    let connector = resolve_connector(&channel_id, &params);
    ws.on_upgrade(move |socket| stream_samples(socket, connector))
}

async fn stream_samples(mut socket: WebSocket, connector: Box<dyn Connector>) {
    let mut ticker = tokio::time::interval(connector.interval());
    loop {
        ticker.tick().await;
        let value = connector.sample();
        if value.is_nan() {
            continue; // データ未取得(初回ポーリング前 / 接続失敗)はスキップ
        }
        let sample = Sample {
            value,
            ts_ms: now_ms(),
        };
        let payload = format!(
            "{{\"value\":{:.4},\"ts\":{}}}",
            sample.value, sample.ts_ms
        );
        if socket.send(Message::Text(payload.into())).await.is_err() {
            break; // クライアント切断
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mock_sample_is_in_range() {
        let c = MockConnector {
            min: 10.0,
            max: 20.0,
            interval_ms: 500,
        };
        for _ in 0..100 {
            let v = c.sample();
            assert!((10.0..=20.0).contains(&v), "value {v} out of range");
        }
        assert_eq!(c.interval(), Duration::from_millis(500));
    }

    #[test]
    fn interval_has_floor() {
        let c = MockConnector { min: 0.0, max: 1.0, interval_ms: 10 };
        assert_eq!(c.interval(), Duration::from_millis(200));
    }

    #[test]
    fn resolve_uses_params() {
        let conn = resolve_connector(
            "temp",
            &ChannelParams {
                min: Some(5.0),
                max: Some(6.0),
                interval: Some(300),
                kind: None,
                host: None,
                unit: None,
                register: None,
                scale: None,
            },
        );
        let v = conn.sample();
        assert!((5.0..=6.0).contains(&v));
        assert_eq!(conn.interval(), Duration::from_millis(300));
    }

    #[tokio::test]
    async fn resolve_modbus_when_kind_modbus() {
        // host が解決できれば Modbus コネクタ(接続は遅延・バックグラウンド)
        let conn = resolve_connector(
            "reg",
            &ChannelParams {
                min: None,
                max: None,
                interval: Some(200),
                kind: Some("modbus".into()),
                host: Some("127.0.0.1:5502".into()),
                unit: Some(1),
                register: Some(0),
                scale: Some(0.1),
            },
        );
        // 接続先が無いので NaN(ストリームでスキップされる値)
        assert!(conn.sample().is_nan());
        assert_eq!(conn.interval(), Duration::from_millis(200));
    }

    #[test]
    fn resolve_falls_back_to_mock_without_host() {
        // kind=modbus でも host が無ければ Mock にフォールバック
        let conn = resolve_connector(
            "x",
            &ChannelParams {
                min: Some(1.0),
                max: Some(2.0),
                interval: Some(300),
                kind: Some("modbus".into()),
                host: None,
                unit: None,
                register: None,
                scale: None,
            },
        );
        let v = conn.sample();
        assert!((1.0..=2.0).contains(&v));
    }

    /// 保持レジスタ 0 番に固定値を返す in-process Modbus/TCP サーバ
    struct FixedRegisterService {
        value: u16,
    }

    impl tokio_modbus::server::Service for FixedRegisterService {
        type Request = tokio_modbus::prelude::Request<'static>;
        type Response = tokio_modbus::prelude::Response;
        type Exception = tokio_modbus::ExceptionCode;
        type Future = std::future::Ready<Result<Self::Response, Self::Exception>>;

        fn call(&self, req: Self::Request) -> Self::Future {
            use tokio_modbus::prelude::{Request, Response};
            let res = match req {
                Request::ReadHoldingRegisters(_addr, cnt) => {
                    Ok(Response::ReadHoldingRegisters(vec![self.value; cnt as usize]))
                }
                _ => Err(tokio_modbus::ExceptionCode::IllegalFunction),
            };
            std::future::ready(res)
        }
    }

    #[tokio::test]
    async fn modbus_connector_reads_scaled_register() {
        use tokio_modbus::server::tcp::{accept_tcp_connection, Server};

        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        tokio::spawn(async move {
            let server = Server::new(listener);
            let new_service =
                |_socket: SocketAddr| Ok(Some(FixedRegisterService { value: 4242 }));
            let on_connected = move |stream, socket| async move {
                accept_tcp_connection(stream, socket, new_service)
            };
            let _ = server.serve(&on_connected, |_err| {}).await;
        });

        // 生値 4242 × scale 0.1 = 424.2 を期待
        let conn = ModbusConnector::connect(addr, 1, 0, 0.1, 200);

        // バックグラウンドポーリングが値を取得するまで待つ
        let mut got = f64::NAN;
        for _ in 0..30 {
            tokio::time::sleep(Duration::from_millis(100)).await;
            let v = conn.sample();
            if !v.is_nan() {
                got = v;
                break;
            }
        }
        assert!((got - 424.2).abs() < 0.001, "expected ~424.2, got {got}");
    }

    #[tokio::test]
    async fn ws_streams_samples_in_range() {
        use axum::routing::get;
        use futures_util::StreamExt;
        use tokio_tungstenite::connect_async;

        let app = axum::Router::new().route("/api/channels/{id}/stream", get(channel_stream));
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        tokio::spawn(async move {
            axum::serve(listener, app).await.unwrap();
        });

        let url = format!("ws://{addr}/api/channels/cpu/stream?min=0&max=50&interval=200");
        let (mut ws, _) = connect_async(&url).await.expect("ws connect");

        for _ in 0..3 {
            let msg = ws.next().await.expect("message").expect("ok");
            let txt = msg.to_text().unwrap();
            let v: serde_json::Value = serde_json::from_str(txt).unwrap();
            let value = v["value"].as_f64().unwrap();
            assert!((0.0..=50.0).contains(&value), "value {value} out of range");
            assert!(v["ts"].as_u64().unwrap() > 0);
        }
    }
}
