-- Area Leader Pro — Schema completo
-- Aplicar desde Supabase Dashboard > SQL Editor

CREATE SCHEMA IF NOT EXISTS area_leader;

CREATE TABLE area_leader.team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL, initials TEXT NOT NULL, role TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#3b82f6', email TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE area_leader.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL, client TEXT,
  status TEXT NOT NULL CHECK (status IN ('on-track','at-risk','delayed','planning','completed')),
  progress INT NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  estimated INT NOT NULL DEFAULT 0 CHECK (estimated BETWEEN 0 AND 100),
  budget NUMERIC(12,2), leader_id UUID REFERENCES area_leader.team_members(id),
  due_date DATE, description TEXT,
  created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE area_leader.tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES area_leader.projects(id) ON DELETE CASCADE,
  assigned_to UUID REFERENCES area_leader.team_members(id),
  title TEXT NOT NULL, group_name TEXT,
  status TEXT NOT NULL CHECK (status IN ('on-track','at-risk','delayed','planning','completed')),
  due_date DATE, created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE area_leader.risks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES area_leader.projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL, description TEXT,
  severity TEXT NOT NULL CHECK (severity IN ('high','medium','low')),
  time_delta TEXT, budget_delta TEXT, created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE area_leader.activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES area_leader.projects(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES area_leader.team_members(id),
  type TEXT NOT NULL CHECK (type IN ('comment','status','milestone','assignment')),
  content TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE area_leader.workload (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES area_leader.team_members(id) ON DELETE CASCADE,
  project_id UUID REFERENCES area_leader.projects(id),
  week_start DATE NOT NULL, day_of_week INT NOT NULL CHECK (day_of_week BETWEEN 1 AND 5),
  hours NUMERIC(4,1) NOT NULL, task_label TEXT, created_at TIMESTAMPTZ DEFAULT now()
);
