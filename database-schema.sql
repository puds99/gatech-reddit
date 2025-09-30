-- =============================================
-- SUPABASE DATABASE SCHEMA FOR GA TECH REDDIT SYSTEM
-- PostgreSQL Schema with Row Level Security (RLS)
-- =============================================

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- For text search
CREATE EXTENSION IF NOT EXISTS "btree_gist"; -- For exclusion constraints

-- =============================================
-- USERS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username VARCHAR(50) UNIQUE NOT NULL,
  display_name VARCHAR(100),
  email VARCHAR(255) UNIQUE NOT NULL,
  photo_url TEXT,
  bio TEXT,
  location VARCHAR(100),
  website VARCHAR(255),
  github_username VARCHAR(50),
  email_verified BOOLEAN DEFAULT FALSE,
  gatech_verified BOOLEAN DEFAULT FALSE,
  gatech_email VARCHAR(255),
  verified_at TIMESTAMPTZ,
  karma JSONB DEFAULT '{"post": 0, "comment": 0, "total": 0}'::jsonb,
  preferences JSONB DEFAULT '{"theme": "dark", "notifications": true, "email_updates": false}'::jsonb,
  roles TEXT[] DEFAULT '{}',
  online_status VARCHAR(20) DEFAULT 'offline',
  last_seen TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT username_length CHECK (char_length(username) >= 3),
  CONSTRAINT valid_email CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}$')
);

-- Create indexes for users
CREATE INDEX idx_users_username ON users USING btree (username);
CREATE INDEX idx_users_email ON users USING btree (email);
CREATE INDEX idx_users_gatech_verified ON users USING btree (gatech_verified) WHERE gatech_verified = true;
CREATE INDEX idx_users_created_at ON users USING btree (created_at DESC);
CREATE INDEX idx_users_karma ON users USING gin (karma);

-- =============================================
-- COMMUNITIES TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS communities (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(50) UNIQUE NOT NULL,
  slug VARCHAR(50) UNIQUE NOT NULL,
  description TEXT NOT NULL,
  type VARCHAR(20) DEFAULT 'general',
  icon_url TEXT,
  banner_url TEXT,
  rules JSONB DEFAULT '[]'::jsonb,
  moderators UUID[] DEFAULT '{}',
  member_count INTEGER DEFAULT 0,
  post_count INTEGER DEFAULT 0,
  settings JSONB DEFAULT '{}'::jsonb,
  last_activity TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT name_length CHECK (char_length(name) >= 3),
  CONSTRAINT slug_format CHECK (slug ~ '^[a-z0-9-]+$')
);

-- Create indexes for communities
CREATE INDEX idx_communities_slug ON communities USING btree (slug);
CREATE INDEX idx_communities_member_count ON communities USING btree (member_count DESC);
CREATE INDEX idx_communities_last_activity ON communities USING btree (last_activity DESC);
CREATE INDEX idx_communities_moderators ON communities USING gin (moderators);

-- =============================================
-- COMMUNITY MEMBERS TABLE (Junction table)
-- =============================================
CREATE TABLE IF NOT EXISTS community_members (
  community_id UUID REFERENCES communities(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (community_id, user_id)
);

-- Create indexes for community members
CREATE INDEX idx_community_members_user ON community_members USING btree (user_id);
CREATE INDEX idx_community_members_community ON community_members USING btree (community_id);

-- =============================================
-- POSTS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS posts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  community_id UUID NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  title VARCHAR(300) NOT NULL,
  content TEXT,
  type VARCHAR(20) DEFAULT 'text' CHECK (type IN ('text', 'link', 'image', 'video')),
  url TEXT,
  tags TEXT[] DEFAULT '{}',
  metadata JSONB DEFAULT '{}'::jsonb,
  score INTEGER DEFAULT 0,
  upvotes INTEGER DEFAULT 0,
  downvotes INTEGER DEFAULT 0,
  comment_count INTEGER DEFAULT 0,
  view_count INTEGER DEFAULT 0,
  hot_score NUMERIC DEFAULT 0,
  controversy_score NUMERIC DEFAULT 0,
  edited BOOLEAN DEFAULT FALSE,
  deleted BOOLEAN DEFAULT FALSE,
  deleted_at TIMESTAMPTZ,
  locked BOOLEAN DEFAULT FALSE,
  pinned BOOLEAN DEFAULT FALSE,
  nsfw BOOLEAN DEFAULT FALSE,
  spoiler BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT title_length CHECK (char_length(title) >= 3)
);

-- Create indexes for posts
CREATE INDEX idx_posts_author ON posts USING btree (author_id);
CREATE INDEX idx_posts_community ON posts USING btree (community_id);
CREATE INDEX idx_posts_deleted ON posts USING btree (deleted) WHERE deleted = false;
CREATE INDEX idx_posts_hot_score ON posts USING btree (hot_score DESC) WHERE deleted = false;
CREATE INDEX idx_posts_score ON posts USING btree (score DESC) WHERE deleted = false;
CREATE INDEX idx_posts_created_at ON posts USING btree (created_at DESC) WHERE deleted = false;
CREATE INDEX idx_posts_controversy ON posts USING btree (controversy_score DESC) WHERE deleted = false;
CREATE INDEX idx_posts_tags ON posts USING gin (tags);
CREATE INDEX idx_posts_search ON posts USING gin (to_tsvector('english', title || ' ' || COALESCE(content, '')));

-- =============================================
-- COMMENTS TABLE (with recursive threading)
-- =============================================
CREATE TABLE IF NOT EXISTS comments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES comments(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  depth INTEGER DEFAULT 0 CHECK (depth >= 0 AND depth <= 5),
  path TEXT, -- Materialized path for efficient tree queries
  score INTEGER DEFAULT 0,
  upvotes INTEGER DEFAULT 0,
  downvotes INTEGER DEFAULT 0,
  edited BOOLEAN DEFAULT FALSE,
  deleted BOOLEAN DEFAULT FALSE,
  deleted_at TIMESTAMPTZ,
  collapsed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT content_length CHECK (char_length(content) >= 1)
);

-- Create indexes for comments
CREATE INDEX idx_comments_post ON comments USING btree (post_id);
CREATE INDEX idx_comments_author ON comments USING btree (author_id);
CREATE INDEX idx_comments_parent ON comments USING btree (parent_id);
CREATE INDEX idx_comments_deleted ON comments USING btree (deleted) WHERE deleted = false;
CREATE INDEX idx_comments_score ON comments USING btree (score DESC) WHERE deleted = false;
CREATE INDEX idx_comments_created_at ON comments USING btree (created_at DESC);
CREATE INDEX idx_comments_path ON comments USING btree (path) WHERE deleted = false;

-- =============================================
-- VOTES TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS votes (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_id UUID NOT NULL,
  target_type VARCHAR(10) NOT NULL CHECK (target_type IN ('post', 'comment')),
  value SMALLINT NOT NULL CHECK (value IN (-1, 1)),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, target_id, target_type)
);

-- Create indexes for votes
CREATE INDEX idx_votes_target ON votes USING btree (target_id, target_type);
CREATE INDEX idx_votes_user ON votes USING btree (user_id);

-- =============================================
-- FUNCTIONS AND TRIGGERS
-- =============================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at trigger to tables
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_communities_updated_at BEFORE UPDATE ON communities
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_posts_updated_at BEFORE UPDATE ON posts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_comments_updated_at BEFORE UPDATE ON comments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to calculate hot score (Reddit-like algorithm)
CREATE OR REPLACE FUNCTION calculate_hot_score(ups INTEGER, downs INTEGER, created TIMESTAMPTZ)
RETURNS NUMERIC AS $$
DECLARE
  s INTEGER;
  order_value NUMERIC;
  seconds NUMERIC;
  hot NUMERIC;
BEGIN
  s := ups - downs;
  IF s > 0 THEN
    order_value := 1;
  ELSIF s < 0 THEN
    order_value := -1;
  ELSE
    order_value := 0;
  END IF;

  seconds := EXTRACT(EPOCH FROM (NOW() - created));
  hot := LOG(10, GREATEST(ABS(s), 1)) * order_value + seconds / 45000;

  RETURN hot;
END;
$$ LANGUAGE plpgsql;

-- Function to update post/comment scores when vote changes
CREATE OR REPLACE FUNCTION update_vote_scores()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    IF NEW.target_type = 'post' THEN
      UPDATE posts
      SET score = (
        SELECT COALESCE(SUM(value), 0) FROM votes
        WHERE target_id = NEW.target_id AND target_type = 'post'
      ),
      upvotes = (
        SELECT COUNT(*) FROM votes
        WHERE target_id = NEW.target_id AND target_type = 'post' AND value = 1
      ),
      downvotes = (
        SELECT COUNT(*) FROM votes
        WHERE target_id = NEW.target_id AND target_type = 'post' AND value = -1
      ),
      hot_score = calculate_hot_score(
        (SELECT COUNT(*) FROM votes WHERE target_id = NEW.target_id AND target_type = 'post' AND value = 1),
        (SELECT COUNT(*) FROM votes WHERE target_id = NEW.target_id AND target_type = 'post' AND value = -1),
        (SELECT created_at FROM posts WHERE id = NEW.target_id)
      )
      WHERE id = NEW.target_id;

    ELSIF NEW.target_type = 'comment' THEN
      UPDATE comments
      SET score = (
        SELECT COALESCE(SUM(value), 0) FROM votes
        WHERE target_id = NEW.target_id AND target_type = 'comment'
      ),
      upvotes = (
        SELECT COUNT(*) FROM votes
        WHERE target_id = NEW.target_id AND target_type = 'comment' AND value = 1
      ),
      downvotes = (
        SELECT COUNT(*) FROM votes
        WHERE target_id = NEW.target_id AND target_type = 'comment' AND value = -1
      )
      WHERE id = NEW.target_id;
    END IF;

    -- Update user karma
    UPDATE users SET karma = jsonb_set(
      jsonb_set(
        karma,
        ARRAY[CASE WHEN NEW.target_type = 'post' THEN 'post' ELSE 'comment' END],
        to_jsonb(COALESCE((karma->>CASE WHEN NEW.target_type = 'post' THEN 'post' ELSE 'comment' END)::INTEGER, 0) + NEW.value)
      ),
      ARRAY['total'],
      to_jsonb(COALESCE((karma->>'total')::INTEGER, 0) + NEW.value)
    )
    WHERE id = (
      SELECT author_id FROM
      CASE WHEN NEW.target_type = 'post' THEN posts ELSE comments END
      WHERE id = NEW.target_id
    );

  ELSIF TG_OP = 'DELETE' THEN
    -- Similar logic for DELETE but subtract the vote
    -- Implementation omitted for brevity
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_vote_scores
AFTER INSERT OR UPDATE OR DELETE ON votes
FOR EACH ROW EXECUTE FUNCTION update_vote_scores();

-- Function to update comment count on posts
CREATE OR REPLACE FUNCTION update_post_comment_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE posts SET comment_count = comment_count + 1 WHERE id = NEW.post_id;
  ELSIF TG_OP = 'DELETE' OR (TG_OP = 'UPDATE' AND NEW.deleted = true AND OLD.deleted = false) THEN
    UPDATE posts SET comment_count = GREATEST(comment_count - 1, 0) WHERE id = COALESCE(NEW.post_id, OLD.post_id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_post_comment_count
AFTER INSERT OR UPDATE OR DELETE ON comments
FOR EACH ROW EXECUTE FUNCTION update_post_comment_count();

-- Function to update community member count
CREATE OR REPLACE FUNCTION update_community_member_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE communities SET member_count = member_count + 1 WHERE id = NEW.community_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE communities SET member_count = GREATEST(member_count - 1, 0) WHERE id = OLD.community_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_community_member_count
AFTER INSERT OR DELETE ON community_members
FOR EACH ROW EXECUTE FUNCTION update_community_member_count();

-- Function to build comment path
CREATE OR REPLACE FUNCTION build_comment_path()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.parent_id IS NULL THEN
    NEW.path = NEW.id::TEXT;
  ELSE
    SELECT path || '/' || NEW.id::TEXT INTO NEW.path
    FROM comments WHERE id = NEW.parent_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_build_comment_path
BEFORE INSERT ON comments
FOR EACH ROW EXECUTE FUNCTION build_comment_path();

-- =============================================
-- STORED PROCEDURES / FUNCTIONS
-- =============================================

-- Function to get threaded comments for a post
CREATE OR REPLACE FUNCTION get_threaded_comments(
  p_post_id UUID,
  p_sort_by VARCHAR DEFAULT 'best',
  p_limit INTEGER DEFAULT 50
)
RETURNS TABLE(
  id UUID,
  post_id UUID,
  author_id UUID,
  parent_id UUID,
  content TEXT,
  depth INTEGER,
  score INTEGER,
  upvotes INTEGER,
  downvotes INTEGER,
  created_at TIMESTAMPTZ,
  author_username VARCHAR,
  author_display_name VARCHAR,
  author_photo_url TEXT,
  children_count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  WITH RECURSIVE comment_tree AS (
    -- Base case: root comments
    SELECT
      c.id,
      c.post_id,
      c.author_id,
      c.parent_id,
      c.content,
      c.depth,
      c.score,
      c.upvotes,
      c.downvotes,
      c.created_at,
      u.username AS author_username,
      u.display_name AS author_display_name,
      u.photo_url AS author_photo_url,
      c.path
    FROM comments c
    JOIN users u ON c.author_id = u.id
    WHERE c.post_id = p_post_id
      AND c.parent_id IS NULL
      AND c.deleted = false

    UNION ALL

    -- Recursive case: child comments
    SELECT
      c.id,
      c.post_id,
      c.author_id,
      c.parent_id,
      c.content,
      c.depth,
      c.score,
      c.upvotes,
      c.downvotes,
      c.created_at,
      u.username AS author_username,
      u.display_name AS author_display_name,
      u.photo_url AS author_photo_url,
      c.path
    FROM comments c
    JOIN users u ON c.author_id = u.id
    JOIN comment_tree ct ON c.parent_id = ct.id
    WHERE c.deleted = false
  )
  SELECT
    ct.*,
    (SELECT COUNT(*) FROM comments WHERE parent_id = ct.id AND deleted = false) AS children_count
  FROM comment_tree ct
  ORDER BY
    CASE WHEN p_sort_by = 'new' THEN ct.created_at END DESC,
    CASE WHEN p_sort_by = 'best' THEN ct.score END DESC,
    ct.path
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- Function to get user karma breakdown
CREATE OR REPLACE FUNCTION get_user_karma(p_user_id UUID)
RETURNS TABLE(
  post_karma INTEGER,
  comment_karma INTEGER,
  total_karma INTEGER,
  post_count BIGINT,
  comment_count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(SUM(CASE WHEN p.id IS NOT NULL THEN p.score ELSE 0 END), 0)::INTEGER AS post_karma,
    COALESCE(SUM(CASE WHEN c.id IS NOT NULL THEN c.score ELSE 0 END), 0)::INTEGER AS comment_karma,
    COALESCE(SUM(CASE WHEN p.id IS NOT NULL THEN p.score ELSE 0 END), 0)::INTEGER +
    COALESCE(SUM(CASE WHEN c.id IS NOT NULL THEN c.score ELSE 0 END), 0)::INTEGER AS total_karma,
    COUNT(DISTINCT p.id) AS post_count,
    COUNT(DISTINCT c.id) AS comment_count
  FROM users u
  LEFT JOIN posts p ON u.id = p.author_id AND p.deleted = false
  LEFT JOIN comments c ON u.id = c.author_id AND c.deleted = false
  WHERE u.id = p_user_id
  GROUP BY u.id;
END;
$$ LANGUAGE plpgsql;

-- Function to increment view count
CREATE OR REPLACE FUNCTION increment_view_count(p_post_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE posts SET view_count = view_count + 1 WHERE id = p_post_id;
END;
$$ LANGUAGE plpgsql;

-- Function to update community stats
CREATE OR REPLACE FUNCTION update_community_stats(
  p_community_id UUID,
  p_post_count_delta INTEGER DEFAULT 0,
  p_last_activity TIMESTAMPTZ DEFAULT NULL
)
RETURNS void AS $$
BEGIN
  UPDATE communities
  SET
    post_count = post_count + p_post_count_delta,
    last_activity = COALESCE(p_last_activity, NOW())
  WHERE id = p_community_id;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- =============================================

-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE communities ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE votes ENABLE ROW LEVEL SECURITY;

-- Users policies
CREATE POLICY "Public users are viewable by everyone"
  ON users FOR SELECT
  USING (true);

CREATE POLICY "Users can update their own profile"
  ON users FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Users can insert their own profile"
  ON users FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Communities policies
CREATE POLICY "Communities are viewable by everyone"
  ON communities FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can create communities"
  ON communities FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Moderators can update their communities"
  ON communities FOR UPDATE
  USING (auth.uid() = ANY(moderators));

-- Community members policies
CREATE POLICY "Community members are viewable by everyone"
  ON community_members FOR SELECT
  USING (true);

CREATE POLICY "Users can join/leave communities"
  ON community_members FOR ALL
  USING (auth.uid() = user_id);

-- Posts policies
CREATE POLICY "Posts are viewable by everyone"
  ON posts FOR SELECT
  USING (deleted = false OR author_id = auth.uid());

CREATE POLICY "Authenticated users can create posts"
  ON posts FOR INSERT
  WITH CHECK (auth.uid() = author_id);

CREATE POLICY "Users can update their own posts"
  ON posts FOR UPDATE
  USING (auth.uid() = author_id);

CREATE POLICY "Users can delete their own posts"
  ON posts FOR DELETE
  USING (auth.uid() = author_id);

-- Comments policies
CREATE POLICY "Comments are viewable by everyone"
  ON comments FOR SELECT
  USING (deleted = false OR author_id = auth.uid());

CREATE POLICY "Authenticated users can create comments"
  ON comments FOR INSERT
  WITH CHECK (auth.uid() = author_id);

CREATE POLICY "Users can update their own comments"
  ON comments FOR UPDATE
  USING (auth.uid() = author_id);

CREATE POLICY "Users can delete their own comments"
  ON comments FOR DELETE
  USING (auth.uid() = author_id);

-- Votes policies
CREATE POLICY "Votes are viewable by the voter"
  ON votes FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their own votes"
  ON votes FOR ALL
  USING (auth.uid() = user_id);

-- =============================================
-- INITIAL DATA (Optional)
-- =============================================

-- Create default communities
INSERT INTO communities (name, slug, description, type) VALUES
  ('General Discussion', 'general', 'General discussion about Georgia Tech and technology', 'general'),
  ('AI & Machine Learning', 'ai-ml', 'Discussions about artificial intelligence and machine learning', 'tech'),
  ('Vibe Coding', 'vibe-coding', 'Share your vibe-coding projects and experiences', 'tech'),
  ('Campus Life', 'campus', 'Everything about life at Georgia Tech', 'campus'),
  ('Career & Jobs', 'careers', 'Job postings, career advice, and professional development', 'career')
ON CONFLICT (slug) DO NOTHING;