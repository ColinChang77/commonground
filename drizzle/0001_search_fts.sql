-- Full-text search (SQLite FTS5) over discussions, projects, opportunities and profiles.
-- Kept in sync by triggers so every write path (web, MCP, webhooks) is indexed.
CREATE VIRTUAL TABLE IF NOT EXISTS search_fts USING fts5(
  entity_type UNINDEXED,
  entity_id UNINDEXED,
  title,
  body,
  tokenize = 'porter unicode61'
);

CREATE TRIGGER discussions_fts_ai AFTER INSERT ON discussions BEGIN
  INSERT INTO search_fts (entity_type, entity_id, title, body) VALUES ('discussion', new.id, new.title, new.body);
END;
CREATE TRIGGER discussions_fts_au AFTER UPDATE OF title, body ON discussions BEGIN
  DELETE FROM search_fts WHERE entity_type = 'discussion' AND entity_id = old.id;
  INSERT INTO search_fts (entity_type, entity_id, title, body) VALUES ('discussion', new.id, new.title, new.body);
END;
CREATE TRIGGER discussions_fts_ad AFTER DELETE ON discussions BEGIN
  DELETE FROM search_fts WHERE entity_type = 'discussion' AND entity_id = old.id;
END;

CREATE TRIGGER projects_fts_ai AFTER INSERT ON projects BEGIN
  INSERT INTO search_fts (entity_type, entity_id, title, body) VALUES ('project', new.id, new.title, new.summary || ' ' || new.description || ' ' || new.tags);
END;
CREATE TRIGGER projects_fts_au AFTER UPDATE OF title, summary, description, tags ON projects BEGIN
  DELETE FROM search_fts WHERE entity_type = 'project' AND entity_id = old.id;
  INSERT INTO search_fts (entity_type, entity_id, title, body) VALUES ('project', new.id, new.title, new.summary || ' ' || new.description || ' ' || new.tags);
END;
CREATE TRIGGER projects_fts_ad AFTER DELETE ON projects BEGIN
  DELETE FROM search_fts WHERE entity_type = 'project' AND entity_id = old.id;
END;

CREATE TRIGGER opportunities_fts_ai AFTER INSERT ON opportunities BEGIN
  INSERT INTO search_fts (entity_type, entity_id, title, body) VALUES ('opportunity', new.id, new.title, new.description || ' ' || new.deliverable);
END;
CREATE TRIGGER opportunities_fts_au AFTER UPDATE OF title, description, deliverable ON opportunities BEGIN
  DELETE FROM search_fts WHERE entity_type = 'opportunity' AND entity_id = old.id;
  INSERT INTO search_fts (entity_type, entity_id, title, body) VALUES ('opportunity', new.id, new.title, new.description || ' ' || new.deliverable);
END;
CREATE TRIGGER opportunities_fts_ad AFTER DELETE ON opportunities BEGIN
  DELETE FROM search_fts WHERE entity_type = 'opportunity' AND entity_id = old.id;
END;

CREATE TRIGGER profiles_fts_ai AFTER INSERT ON profiles BEGIN
  INSERT INTO search_fts (entity_type, entity_id, title, body) VALUES ('user', new.user_id, new.display_name || ' ' || new.username, new.bio);
END;
CREATE TRIGGER profiles_fts_au AFTER UPDATE OF display_name, username, bio ON profiles BEGIN
  DELETE FROM search_fts WHERE entity_type = 'user' AND entity_id = old.user_id;
  INSERT INTO search_fts (entity_type, entity_id, title, body) VALUES ('user', new.user_id, new.display_name || ' ' || new.username, new.bio);
END;
CREATE TRIGGER profiles_fts_ad AFTER DELETE ON profiles BEGIN
  DELETE FROM search_fts WHERE entity_type = 'user' AND entity_id = old.user_id;
END;

-- Reference data
INSERT INTO agent_providers (id, name, kind, docs_url, enabled) VALUES
  ('anthropic', 'Claude (Anthropic API)', 'hosted', 'https://docs.claude.com/en/api/overview', 1),
  ('openai', 'OpenAI (Codex / API)', 'hosted', 'https://platform.openai.com/docs/api-reference', 1),
  ('mcp', 'Bring your own agent (MCP)', 'byo', 'https://modelcontextprotocol.io/specification', 1);
