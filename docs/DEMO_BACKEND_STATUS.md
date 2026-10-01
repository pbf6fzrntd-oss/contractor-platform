# Lowcountry demo backend status

Dedicated project: [lowcountry-production-demo](https://supabase.com/dashboard/project/vzknpvdayhdveumgvecd), US East. Supabase quoted $0/month for creation in the connected organization. This is a fictional demo backend, not a customer production database or an editable hosted app.

## Completed and verified

- Applied the repository schema, recovery/dispatch work, demo-only guard and internal-trigger hardening (26 migrations).
- Enabled the private demo-only switch. Live transaction checks proved ordinary organizations and demo-to-ordinary conversion are rejected, while fictional demo creation succeeds.
- Live authenticated-role checks proved tenant isolation and rejection of direct ordinary onboarding RPCs. Verification fixtures were rolled back; no operator credentials or real business records were created.
- Every public table has RLS enabled. The `private-files` storage bucket is private. Service-role seeding access exists; authenticated users cannot disable the private deployment guard.
- Pinned two trigger function search paths and revoked ordinary API execution of three internal SECURITY DEFINER trigger functions. Re-ran Supabase Security Advisors to verify the mutable-path warnings and those execution findings disappeared.

## Remaining launch work

Hosting access and final HTTPS origin, protected server keys/operator credentials, Auth redirect settings, the authenticated dispatch schedule, browser checks against the deployed service, and backup/restore verification are still required. The existing ChatGPT previews remain read-only.

### Migration history: reconciled

The MCP migration API assigned deployment-time version IDs instead of the existing repository timestamps. The schema was installed successfully, but the CLI cannot safely infer that these differently numbered migrations are the same work. The history has now been reconciled with the repository; existing migrations must not be replayed or the project reset.

The user approved both the connected Supabase organization and the 26 ID corrections on 2026-10-01. The original migration history was exported before an atomic update guarded by the exact old IDs, names, SQL hashes and row count. Twenty-five SQL payloads matched repository files exactly; the remaining hardening payload matched after comment/whitespace normalization. No migration SQL was rerun. All 26 resulting IDs now match the repository. Before/after fingerprints verified that the schema and data in 49 application, private-setting, Auth-user and Storage tables were unchanged.

The table below records the completed transition: “Applied ID” is the former API-assigned ID; “Repository ID” is the current reconciled ID. Continue through the normal migration workflow for future new migrations. Hosting and deployed verification remain outstanding.

| Migration | Applied ID | Repository ID |
|---|---|---|
| foundation | 20261001121632 | 20260929000000 |
| m1_phone_contacts_messages | 20261001121651 | 20260929010000 |
| m3_outbox | 20261001121700 | 20260929030000 |
| m4_jobs | 20261001121705 | 20260929040000 |
| m6_recurring_services | 20261001121712 | 20260929060000 |
| m7_broadcasts | 20261001121718 | 20260929070000 |
| m12_ai_assistant_access | 20261001121726 | 20260929120000 |
| m13_oauth_full_access | 20261001121733 | 20260929130000 |
| m14_team_ai | 20261001121831 | 20260929140000 |
| m15_industries_modules | 20261001121838 | 20260929150000 |
| m17_audit_reports | 20261001121847 | 20260929170000 |
| m18_subjects_files_credentials | 20261001121853 | 20260929180000 |
| m19_booking | 20261001121901 | 20260929190000 |
| m20_approvals_sources | 20261001121907 | 20260929200000 |
| m21_editions_addons | 20261001121913 | 20260929210000 |
| m22_agent_ready | 20261001121920 | 20260929220000 |
| m23_booking_hardening | 20261001122031 | 20260930010000 |
| m24_expiry_and_photos | 20261001122036 | 20260930020000 |
| demo_sandboxes | 20261001122044 | 20260930030000 |
| m26_selling | 20261001122052 | 20260930040000 |
| m27_recurring_home | 20261001122100 | 20260930050000 |
| m28_visit_reports | 20261001122105 | 20260930060000 |
| demo_recovery | 20261001122112 | 20261001000000 |
| reporting_dispatch | 20261001122121 | 20261001010000 |
| hosted_demo_database_guard | 20261001122129 | 20261001121301 |
| harden_internal_trigger_functions | 20261001122512 | 20261001122344 |

### Advisor follow-ups

[Security Advisors](https://supabase.com/docs/guides/database/database-linter) still reports expected service-only tables with RLS and no user policies, plus intentionally callable membership/onboarding/public-profile functions. Review these against the access model; do not grant user policies to internal service tables or revoke public-profile access indiscriminately.

The [btree_gist extension warning](https://supabase.com/docs/guides/database/database-linter?lint=0014_extension_in_public) remains: moving the extension requires checking exclusion constraints, operator classes and future migration search paths. Performance follow-ups include [unindexed foreign keys](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys), [RLS init plans](https://supabase.com/docs/guides/database/database-linter?lint=0003_auth_rls_initplan), and [overlapping policies](https://supabase.com/docs/guides/database/database-linter?lint=0006_multiple_permissive_policies). The empty demo database also reports unused indexes; retain them until traffic measurements justify changes.

This audit does not certify customer billing, live messaging, real-user onboarding or production operations.

