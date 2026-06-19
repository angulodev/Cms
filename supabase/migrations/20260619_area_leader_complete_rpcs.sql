-- ══════════════════════════════════════════════════════════════════
--  AREA_LEADER — Completar multi-tenant en RPCs restantes
--  (team_members, risks, activity, project_members, delete_task)
--  que quedaron con la firma vieja tras la migración anterior.
-- ══════════════════════════════════════════════════════════════════

-- ──────────────────────────────────────────────────────────────────
-- 1. risks.status — el frontend ya lo envía, la tabla no lo tenía
-- ──────────────────────────────────────────────────────────────────
ALTER TABLE area_leader.risks ADD COLUMN status TEXT NOT NULL DEFAULT 'active'
  CHECK (status IN ('active','mitigated','closed'));

-- ──────────────────────────────────────────────────────────────────
-- 2. al_upsert_member — requiere company_id + permiso team.manage
-- ──────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.al_upsert_member(uuid,text,text,text,text,text,boolean);

CREATE FUNCTION public.al_upsert_member(
  p_company_id UUID, p_id UUID DEFAULT NULL, p_name TEXT DEFAULT NULL,
  p_initials TEXT DEFAULT NULL, p_role TEXT DEFAULT NULL, p_color TEXT DEFAULT '#3b82f6',
  p_email TEXT DEFAULT NULL, p_active BOOLEAN DEFAULT NULL, p_user_id UUID DEFAULT NULL
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_id UUID;
BEGIN
  IF NOT sys_core.has_permission(p_company_id, 'area_leader.team.manage') THEN
    RAISE EXCEPTION 'forbidden: missing area_leader.team.manage';
  END IF;

  IF p_id IS NOT NULL THEN
    UPDATE area_leader.team_members SET
      name=COALESCE(p_name,name), initials=COALESCE(p_initials,initials),
      role=COALESCE(p_role,role), color=COALESCE(p_color,color),
      email=COALESCE(p_email,email), active=COALESCE(p_active,active),
      user_id=COALESCE(p_user_id,user_id)
    WHERE id=p_id AND company_id=p_company_id RETURNING id INTO v_id;
  ELSE
    INSERT INTO area_leader.team_members(company_id,name,initials,role,color,email,active,user_id)
    VALUES(p_company_id,p_name,p_initials,p_role,p_color,p_email,COALESCE(p_active,true),p_user_id)
    RETURNING id INTO v_id;
  END IF;

  PERFORM sys_core.log_audit(p_company_id, 'area_leader', 'team_member', v_id,
    CASE WHEN p_id IS NULL THEN 'create' ELSE 'update' END);

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.al_upsert_member TO authenticated;

DROP FUNCTION IF EXISTS public.al_deactivate_member(uuid);
CREATE FUNCTION public.al_deactivate_member(p_company_id UUID, p_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT sys_core.has_permission(p_company_id, 'area_leader.team.manage') THEN
    RAISE EXCEPTION 'forbidden: missing area_leader.team.manage';
  END IF;
  UPDATE area_leader.team_members SET active=false WHERE id=p_id AND company_id=p_company_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.al_deactivate_member TO authenticated;

DROP FUNCTION IF EXISTS public.al_activate_member(uuid);
CREATE FUNCTION public.al_activate_member(p_company_id UUID, p_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT sys_core.has_permission(p_company_id, 'area_leader.team.manage') THEN
    RAISE EXCEPTION 'forbidden: missing area_leader.team.manage';
  END IF;
  UPDATE area_leader.team_members SET active=true WHERE id=p_id AND company_id=p_company_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.al_activate_member TO authenticated;

DROP FUNCTION IF EXISTS public.al_delete_member(uuid);
CREATE FUNCTION public.al_delete_member(p_company_id UUID, p_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT sys_core.has_permission(p_company_id, 'area_leader.team.manage') THEN
    RAISE EXCEPTION 'forbidden: missing area_leader.team.manage';
  END IF;
  DELETE FROM area_leader.team_members WHERE id=p_id AND company_id=p_company_id;
  PERFORM sys_core.log_audit(p_company_id, 'area_leader', 'team_member', p_id, 'delete');
END;
$$;

GRANT EXECUTE ON FUNCTION public.al_delete_member TO authenticated;

-- ──────────────────────────────────────────────────────────────────
-- 3. al_add_activity — requiere company_id (el actor se infiere de auth.uid())
-- ──────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.al_add_activity(uuid,uuid,text,text);

CREATE FUNCTION public.al_add_activity(
  p_company_id UUID, p_project_id UUID, p_actor_id UUID, p_type TEXT, p_content TEXT
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT sys_core.is_member_of(p_company_id) THEN
    RAISE EXCEPTION 'forbidden: not a member of this company';
  END IF;
  INSERT INTO area_leader.activity(company_id, project_id, actor_id, type, content)
  VALUES (p_company_id, p_project_id, p_actor_id, p_type, p_content);
END;
$$;

GRANT EXECUTE ON FUNCTION public.al_add_activity TO authenticated;

-- ──────────────────────────────────────────────────────────────────
-- 4. al_add_project_member / al_remove_project_member
-- ──────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.al_add_project_member(uuid,uuid);

CREATE FUNCTION public.al_add_project_member(p_company_id UUID, p_project_id UUID, p_member_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT sys_core.has_permission(p_company_id, 'area_leader.team.manage') THEN
    RAISE EXCEPTION 'forbidden: missing area_leader.team.manage';
  END IF;
  INSERT INTO area_leader.project_members(company_id, project_id, member_id)
  VALUES(p_company_id, p_project_id, p_member_id) ON CONFLICT DO NOTHING;
END;
$$;

GRANT EXECUTE ON FUNCTION public.al_add_project_member TO authenticated;

DROP FUNCTION IF EXISTS public.al_remove_project_member(uuid,uuid);

CREATE FUNCTION public.al_remove_project_member(p_company_id UUID, p_project_id UUID, p_member_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT sys_core.has_permission(p_company_id, 'area_leader.team.manage') THEN
    RAISE EXCEPTION 'forbidden: missing area_leader.team.manage';
  END IF;
  DELETE FROM area_leader.project_members
  WHERE project_id=p_project_id AND member_id=p_member_id AND company_id=p_company_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.al_remove_project_member TO authenticated;

-- ──────────────────────────────────────────────────────────────────
-- 5. al_delete_task
-- ──────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.al_delete_task(uuid);

CREATE FUNCTION public.al_delete_task(p_company_id UUID, p_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_is_assignee BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM area_leader.tasks t
    JOIN area_leader.team_members tm ON tm.id = t.assigned_to
    WHERE t.id = p_id AND tm.user_id = auth.uid()
  ) INTO v_is_assignee;

  IF NOT (sys_core.has_permission(p_company_id, 'area_leader.task.manage_all')
          OR (sys_core.has_permission(p_company_id, 'area_leader.task.manage_own') AND v_is_assignee)) THEN
    RAISE EXCEPTION 'forbidden: missing task management permission';
  END IF;

  DELETE FROM area_leader.tasks WHERE id=p_id AND company_id=p_company_id;
  PERFORM sys_core.log_audit(p_company_id, 'area_leader', 'task', p_id, 'delete');
END;
$$;

GRANT EXECUTE ON FUNCTION public.al_delete_task TO authenticated;

-- ──────────────────────────────────────────────────────────────────
-- 6. al_upsert_risk / al_delete_risk — agregar company_id + p_status
-- ──────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.al_upsert_risk(uuid,uuid,text,text,text,text,text);

CREATE FUNCTION public.al_upsert_risk(
  p_company_id UUID, p_id UUID DEFAULT NULL, p_project_id UUID DEFAULT NULL,
  p_title TEXT DEFAULT NULL, p_description TEXT DEFAULT NULL,
  p_severity TEXT DEFAULT 'medium', p_time_delta TEXT DEFAULT NULL,
  p_budget_delta TEXT DEFAULT NULL, p_status TEXT DEFAULT 'active'
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_id UUID;
BEGIN
  IF NOT sys_core.has_permission(p_company_id, 'area_leader.risk.manage') THEN
    RAISE EXCEPTION 'forbidden: missing area_leader.risk.manage';
  END IF;

  IF p_id IS NOT NULL THEN
    UPDATE area_leader.risks SET
      title=COALESCE(p_title,title), description=COALESCE(p_description,description),
      severity=COALESCE(p_severity,severity), time_delta=p_time_delta,
      budget_delta=p_budget_delta, status=COALESCE(p_status,status)
    WHERE id=p_id AND company_id=p_company_id RETURNING id INTO v_id;
  ELSE
    INSERT INTO area_leader.risks(company_id,project_id,title,description,severity,time_delta,budget_delta,status)
    VALUES(p_company_id,p_project_id,p_title,p_description,p_severity,p_time_delta,p_budget_delta,COALESCE(p_status,'active'))
    RETURNING id INTO v_id;
  END IF;

  PERFORM sys_core.log_audit(p_company_id, 'area_leader', 'risk', v_id,
    CASE WHEN p_id IS NULL THEN 'create' ELSE 'update' END);

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.al_upsert_risk TO authenticated;

DROP FUNCTION IF EXISTS public.al_delete_risk(uuid);

CREATE FUNCTION public.al_delete_risk(p_company_id UUID, p_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT sys_core.has_permission(p_company_id, 'area_leader.risk.manage') THEN
    RAISE EXCEPTION 'forbidden: missing area_leader.risk.manage';
  END IF;
  DELETE FROM area_leader.risks WHERE id=p_id AND company_id=p_company_id;
  PERFORM sys_core.log_audit(p_company_id, 'area_leader', 'risk', p_id, 'delete');
END;
$$;

GRANT EXECUTE ON FUNCTION public.al_delete_risk TO authenticated;

-- ──────────────────────────────────────────────────────────────────
-- 7. Vista al_risks_by_project — exponer status
-- ──────────────────────────────────────────────────────────────────
DROP VIEW IF EXISTS public.al_risks_by_project;
CREATE VIEW public.al_risks_by_project AS
  SELECT r.*, p.name AS project_name
  FROM area_leader.risks r
  LEFT JOIN area_leader.projects p ON p.id = r.project_id;
GRANT SELECT ON public.al_risks_by_project TO authenticated;
REVOKE SELECT ON public.al_risks_by_project FROM anon;

DROP VIEW IF EXISTS public.al_risks;
CREATE VIEW public.al_risks AS SELECT * FROM area_leader.risks;
GRANT SELECT ON public.al_risks TO authenticated;
REVOKE SELECT ON public.al_risks FROM anon;
