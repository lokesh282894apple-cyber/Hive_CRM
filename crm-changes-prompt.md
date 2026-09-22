# CRM changes — audit-first implementation prompt

Source: founder + admissions live review. Inputs 1–2 (WhatsApp reject list, Excel fee/loan columns) were **not pasted** in the task — treat as missing.

## Audit rule

For every ID: DONE-FULL | DONE-PARTIAL | NOT DONE after checking schema, API, UI, permissions, analytics, existing data. Implement DONE-PARTIAL + NOT DONE only. CONFIRM → conservative, no destructive renames.

## Order

1. FN + RR  
2. SC  
3. CE + CP + PD  
4. AN  
5. PY + US + OP  

## Constraints

Calling must not break. Backward-compatible migrations only. Server-side mandatory validation. Reuse existing components.
