INSERT INTO trade_advice_input_batches (
  id,
  portfolio_id,
  advice_run_id,
  status,
  submitted_at,
  updated_at,
  notes
)
SELECT
  'ignored-' || r.id,
  r.portfolio_id,
  r.id,
  'ignored',
  datetime('now'),
  datetime('now'),
  'Ignored during rollout; user did not go through with this advice.'
FROM trade_advice_runs r
LEFT JOIN trade_advice_input_batches b ON b.advice_run_id = r.id
WHERE r.status = 'success'
  AND b.id IS NULL;

UPDATE trade_recommendations
SET status = 'skipped', updated_at = datetime('now')
WHERE status = 'pending'
  AND advice_run_id IN (
    SELECT advice_run_id
    FROM trade_advice_input_batches
    WHERE status = 'ignored'
  );
