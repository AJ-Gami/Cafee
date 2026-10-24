-- Fasa 6 (kemasan): tetapkan search_path untuk semua fungsi (amalan keselamatan Supabase,
-- elak amaran "function_search_path_mutable"). Semua rujukan dalam fungsi sudah berkelayakan skema.
alter function public.set_updated_at() set search_path = '';
alter function public.profiles_lock_plan() set search_path = '';
alter function public.receipts_set_assessment_year() set search_path = '';
alter function public.expense_refs_ok(uuid, uuid) set search_path = '';
alter function public.debts_sync_status() set search_path = '';
alter function public.debt_payments_apply() set search_path = '';
alter function public.vehicle_owned(uuid) set search_path = '';
alter function public.system_expense_category(text) set search_path = '';
alter function public.vehicle_services_sync_expense() set search_path = '';
alter function public.fuel_logs_sync_expense() set search_path = '';
alter function public.vehicle_records_delete_expense() set search_path = '';
alter function public.vehicle_records_bump_odometer() set search_path = '';
alter function public.link_folder_owned(uuid) set search_path = '';

-- Fungsi pembantu RLS tidak perlu dipanggil terus oleh anon.
revoke execute on function public.expense_refs_ok(uuid, uuid) from anon;
revoke execute on function public.vehicle_owned(uuid) from anon;
revoke execute on function public.link_folder_owned(uuid) from anon;
