use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        Path, Query,
    },
    response::Response,
};
use serde::Deserialize;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

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

#[derive(Deserialize)]
pub struct ChannelParams {
    pub min: Option<f64>,
    pub max: Option<f64>,
    pub interval: Option<u64>,
}

/// チャネル ID + パラメータからコネクタを解決する。
/// 現状はすべて MockConnector。将来は channel 定義(Modbus レジスタマップ等)から生成する。
pub fn resolve_connector(_channel_id: &str, params: &ChannelParams) -> Box<dyn Connector> {
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
        let sample = Sample {
            value: connector.sample(),
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
            assert!(v >= 10.0 && v <= 20.0, "value {v} out of range");
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
            &ChannelParams { min: Some(5.0), max: Some(6.0), interval: Some(300) },
        );
        let v = conn.sample();
        assert!(v >= 5.0 && v <= 6.0);
        assert_eq!(conn.interval(), Duration::from_millis(300));
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
