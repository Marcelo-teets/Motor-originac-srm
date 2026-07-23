-- Harden every Knowledge Vault function: PUBLIC execute is removed explicitly.
revoke all on function public.knowledge_slugify(text) from public, anon;
revoke all on function public.refresh_knowledge_links(uuid) from public, anon;
revoke all on function public.knowledge_list_nodes(text, text, uuid, text) from public, anon;
revoke all on function public.knowledge_get_node(uuid) from public, anon;
revoke all on function public.knowledge_save_node(uuid, text, text, text, text[], jsonb, uuid, text) from public, anon;
revoke all on function public.knowledge_archive_node(uuid) from public, anon;
revoke all on function public.knowledge_graph_snapshot(uuid, integer) from public, anon;
revoke all on function public.knowledge_company_workspace(uuid) from public, anon;
revoke all on function public.knowledge_capture_signal_note(uuid, text) from public, anon;
revoke all on function public.knowledge_capture_qualification_note(uuid, text) from public, anon;
revoke all on function public.touch_knowledge_updated_at() from public, anon;
revoke all on function public.version_knowledge_node() from public, anon;
revoke all on function public.validate_knowledge_reference() from public, anon;

grant execute on function public.knowledge_slugify(text) to authenticated, service_role;
grant execute on function public.refresh_knowledge_links(uuid) to authenticated, service_role;
grant execute on function public.knowledge_list_nodes(text, text, uuid, text) to authenticated, service_role;
grant execute on function public.knowledge_get_node(uuid) to authenticated, service_role;
grant execute on function public.knowledge_save_node(uuid, text, text, text, text[], jsonb, uuid, text) to authenticated, service_role;
grant execute on function public.knowledge_archive_node(uuid) to authenticated, service_role;
grant execute on function public.knowledge_graph_snapshot(uuid, integer) to authenticated, service_role;
grant execute on function public.knowledge_company_workspace(uuid) to authenticated, service_role;
grant execute on function public.knowledge_capture_signal_note(uuid, text) to authenticated, service_role;
grant execute on function public.knowledge_capture_qualification_note(uuid, text) to authenticated, service_role;
