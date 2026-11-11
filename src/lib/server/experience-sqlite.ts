import type { DatabaseSync } from "node:sqlite";
export function migrateExperiences(db: DatabaseSync) {
  db.exec(`
 CREATE TABLE IF NOT EXISTS experience_settings(id INTEGER PRIMARY KEY CHECK(id=1),data TEXT NOT NULL,pin_hash TEXT);
 CREATE TABLE IF NOT EXISTS table_sessions(id TEXT PRIMARY KEY,table_id TEXT NOT NULL REFERENCES restaurant_tables(id),active INTEGER NOT NULL DEFAULT 1,version INTEGER NOT NULL DEFAULT 1,expires_at TEXT NOT NULL,data TEXT NOT NULL);
 CREATE UNIQUE INDEX IF NOT EXISTS group_active_table_idx ON table_sessions(table_id) WHERE active=1;
 CREATE INDEX IF NOT EXISTS group_expiry_idx ON table_sessions(active,expires_at);
 CREATE TABLE IF NOT EXISTS session_actions(session_id TEXT NOT NULL REFERENCES table_sessions(id),mutation_id TEXT NOT NULL,PRIMARY KEY(session_id,mutation_id));
 CREATE TABLE IF NOT EXISTS order_reviews(id TEXT PRIMARY KEY,order_id TEXT NOT NULL UNIQUE REFERENCES orders(id),table_id TEXT NOT NULL REFERENCES restaurant_tables(id),created_at TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'new' CHECK(status IN ('new','analysis','handling','resolved')),version INTEGER NOT NULL DEFAULT 1,data TEXT NOT NULL);
 CREATE INDEX IF NOT EXISTS reviews_created_idx ON order_reviews(created_at,status);
 CREATE TABLE IF NOT EXISTS commercial_recommendations(id TEXT PRIMARY KEY,fingerprint TEXT UNIQUE NOT NULL,status TEXT NOT NULL DEFAULT 'new' CHECK(status IN ('new','applied','ignored','resolved')),version INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL,data TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS recommendation_actions(id TEXT PRIMARY KEY,recommendation_id TEXT NOT NULL REFERENCES commercial_recommendations(id),actor TEXT NOT NULL,action TEXT NOT NULL,created_at TEXT NOT NULL,data TEXT NOT NULL);
 CREATE INDEX IF NOT EXISTS recommendation_actions_rec_idx ON recommendation_actions(recommendation_id,created_at);
 CREATE TABLE IF NOT EXISTS experience_rate_limits(key TEXT PRIMARY KEY,count INTEGER NOT NULL,expires_at INTEGER NOT NULL);
 `);
  const cols = new Set(
    (
      db.prepare("PRAGMA table_info(analytics_events)").all() as {
        name: string;
      }[]
    ).map((c) => c.name),
  );
  for (const [col, type] of Object.entries({
    table_id: "TEXT REFERENCES restaurant_tables(id)",
    order_id: "TEXT REFERENCES orders(id)",
    metadata: "TEXT NOT NULL DEFAULT '{}'",
    verified: "INTEGER NOT NULL DEFAULT 0",
  }))
    if (!cols.has(col))
      db.exec(`ALTER TABLE analytics_events ADD COLUMN ${col} ${type}`);
  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS verified_order_event_idx ON analytics_events(order_id,type) WHERE verified=1;
 CREATE INDEX IF NOT EXISTS analytics_session_type_idx ON analytics_events(session_id,type,created_at);
 DROP TRIGGER IF EXISTS experience_order_insert;
 DROP TRIGGER IF EXISTS experience_order_delivered;
 CREATE TRIGGER experience_order_insert AFTER INSERT ON orders BEGIN
 INSERT OR IGNORE INTO analytics_events(id,type,product_id,category_id,session_id,created_at,table_id,order_id,metadata,verified) VALUES(lower(hex(randomblob(16))),'order_confirmed',NULL,NULL,coalesce(json_extract(NEW.data,'$.analyticsSessionId'),NEW.id),NEW.created_at,NEW.table_id,NEW.id,json_object('dataMode',coalesce(json_extract(NEW.data,'$.dataMode'),'production')),1);
 END;
 CREATE TRIGGER experience_order_delivered AFTER UPDATE ON orders WHEN NEW.status='delivered' AND OLD.status<>'delivered' BEGIN
 INSERT OR IGNORE INTO analytics_events(id,type,session_id,created_at,table_id,order_id,metadata,verified) VALUES(lower(hex(randomblob(16))),'order_completed',coalesce(json_extract(NEW.data,'$.analyticsSessionId'),NEW.id),json_extract(NEW.data,'$.updatedAt'),NEW.table_id,NEW.id,json_object('dataMode',coalesce(json_extract(NEW.data,'$.dataMode'),'production')),1);
 END;
 CREATE TRIGGER IF NOT EXISTS experience_review_insert AFTER INSERT ON order_reviews BEGIN
 INSERT OR IGNORE INTO analytics_events(id,type,session_id,created_at,table_id,order_id,metadata,verified) SELECT lower(hex(randomblob(16))),'review_submitted',coalesce(json_extract(data,'$.analyticsSessionId'),id),NEW.created_at,NEW.table_id,NEW.order_id,json_object('dataMode',coalesce(json_extract(data,'$.dataMode'),'production')),1 FROM orders WHERE id=NEW.order_id;
 END;
 DROP TRIGGER IF EXISTS experience_group_order;
 CREATE TRIGGER experience_group_order AFTER UPDATE ON orders WHEN json_extract(NEW.data,'$.groupSessionId') IS NOT NULL BEGIN
 UPDATE table_sessions SET version=version+1,data=json_set(data,'$.version',version+1,'$.orders',json(coalesce((SELECT json_group_array(json(CASE WHEN json_extract(value,'$.id')=NEW.id THEN NEW.data ELSE value END)) FROM json_each(table_sessions.data,'$.orders')),'[]')),'$.status',CASE WHEN json_extract(data,'$.roundKey')=NEW.idempotency_key AND json_extract(data,'$.status') NOT IN ('closed','expired') THEN CASE NEW.status WHEN 'preparing' THEN 'preparing' WHEN 'ready' THEN 'preparing' WHEN 'delivered' THEN 'finished' ELSE 'sent' END ELSE json_extract(data,'$.status') END) WHERE id=json_extract(NEW.data,'$.groupSessionId') AND EXISTS(SELECT 1 FROM json_each(table_sessions.data,'$.orders') WHERE json_extract(value,'$.id')=NEW.id);
 END;
 `);
}
