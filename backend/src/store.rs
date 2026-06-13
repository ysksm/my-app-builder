use rusqlite::{params, Connection};
use serde::Serialize;
use std::sync::{Arc, Mutex, MutexGuard};
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Clone)]
pub struct Store {
    conn: Arc<Mutex<Connection>>,
}

#[derive(Serialize)]
pub struct ProjectSummary {
    pub id: String,
    pub name: String,
    pub updated_at: i64,
}

#[derive(Serialize)]
pub struct Project {
    pub id: String,
    pub name: String,
    pub doc: serde_json::Value,
    pub updated_at: i64,
}

#[derive(Debug)]
pub enum StoreError {
    NotFound,
    Internal(String),
}

impl From<rusqlite::Error> for StoreError {
    fn from(e: rusqlite::Error) -> Self {
        match e {
            rusqlite::Error::QueryReturnedNoRows => StoreError::NotFound,
            other => StoreError::Internal(other.to_string()),
        }
    }
}

fn now() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

impl Store {
    pub fn open(path: &str) -> Result<Self, StoreError> {
        Self::from_connection(Connection::open(path)?)
    }

    #[cfg(test)]
    pub fn open_in_memory() -> Result<Self, StoreError> {
        Self::from_connection(Connection::open_in_memory()?)
    }

    fn from_connection(conn: Connection) -> Result<Self, StoreError> {
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS projects (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                doc TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );",
        )?;
        Ok(Store {
            conn: Arc::new(Mutex::new(conn)),
        })
    }

    fn lock(&self) -> Result<MutexGuard<'_, Connection>, StoreError> {
        self.conn
            .lock()
            .map_err(|e| StoreError::Internal(e.to_string()))
    }

    pub fn list(&self) -> Result<Vec<ProjectSummary>, StoreError> {
        let conn = self.lock()?;
        let mut stmt =
            conn.prepare("SELECT id, name, updated_at FROM projects ORDER BY updated_at DESC")?;
        let rows = stmt.query_map([], |row| {
            Ok(ProjectSummary {
                id: row.get(0)?,
                name: row.get(1)?,
                updated_at: row.get(2)?,
            })
        })?;
        rows.collect::<Result<_, _>>().map_err(Into::into)
    }

    pub fn get(&self, id: &str) -> Result<Project, StoreError> {
        let conn = self.lock()?;
        let mut stmt =
            conn.prepare("SELECT id, name, doc, updated_at FROM projects WHERE id = ?1")?;
        let (id, name, doc_text, updated_at) = stmt.query_row(params![id], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, i64>(3)?,
            ))
        })?;
        let doc =
            serde_json::from_str(&doc_text).map_err(|e| StoreError::Internal(e.to_string()))?;
        Ok(Project {
            id,
            name,
            doc,
            updated_at,
        })
    }

    pub fn create(&self, name: &str, doc: &serde_json::Value) -> Result<Project, StoreError> {
        let id = uuid::Uuid::new_v4().to_string();
        let ts = now();
        {
            let conn = self.lock()?;
            conn.execute(
                "INSERT INTO projects (id, name, doc, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?4)",
                params![id, name, doc.to_string(), ts],
            )?;
        }
        self.get(&id)
    }

    pub fn update(&self, id: &str, name: &str, doc: &serde_json::Value) -> Result<Project, StoreError> {
        {
            let conn = self.lock()?;
            let changed = conn.execute(
                "UPDATE projects SET name = ?2, doc = ?3, updated_at = ?4 WHERE id = ?1",
                params![id, name, doc.to_string(), now()],
            )?;
            if changed == 0 {
                return Err(StoreError::NotFound);
            }
        }
        self.get(id)
    }

    pub fn delete(&self, id: &str) -> Result<(), StoreError> {
        let conn = self.lock()?;
        let changed = conn.execute("DELETE FROM projects WHERE id = ?1", params![id])?;
        if changed == 0 {
            return Err(StoreError::NotFound);
        }
        Ok(())
    }
}
