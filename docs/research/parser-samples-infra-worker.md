# Parser Samples: Infrastructure & Worker Parsers

Real-world error output samples collected from Stack Overflow, GitHub issues, and official documentation.
Used to build and test TracePulse parsers for infrastructure and background worker log formats.

---

## 1. Migration Parser

### 1a. Alembic — Can't locate revision

**Source:** https://stackoverflow.com/questions/46451160/failed-cant-locate-revision

```
INFO  [alembic.runtime.migration] Context impl PostgresqlImpl.
INFO  [alembic.runtime.migration] Will assume transactional DDL.
ERROR [alembic.util.messaging] Can't locate revision identified by '67ad9835cada'
  FAILED: Can't locate revision identified by '67ad9835cada'
```

**Parser should extract:**
- level: `error`
- error_type: `alembic-revision-not-found`
- message: `Can't locate revision identified by '67ad9835cada'`
- revision: `67ad9835cada`

---

### 1b. Alembic — Target database is not up to date

**Source:** https://stackoverflow.com/questions/17768940/target-database-is-not-up-to-date

```
[alembic.util] Target database is not up to date.
```

**Parser should extract:**
- level: `error`
- error_type: `alembic-database-not-up-to-date`
- message: `Target database is not up to date.`

---

### 1c. Django — InconsistentMigrationHistory

**Source:** https://stackoverflow.com/questions/71956808/how-to-solve-this-error-django-db-migrations-exceptions-inconsistentmigrationhi

```
django.db.migrations.exceptions.InconsistentMigrationHistory: Migration admin.0001_initial is applied before its dependency users.0001_initial on database 'default'.
```

**Parser should extract:**
- level: `error`
- error_type: `django-inconsistent-migration-history`
- message: `Migration admin.0001_initial is applied before its dependency users.0001_initial on database 'default'.`
- migration: `admin.0001_initial`
- dependency: `users.0001_initial`
- database: `default`

---

### 1d. Django — InconsistentMigrationHistory (full traceback)

**Source:** https://stackoverflow.com/questions/44651760/django-db-migrations-exceptions-inconsistentmigrationhistory

```
Traceback (most recent call last):
  File "manage.py", line 22, in <module>
    execute_from_command_line(sys.argv)
  ...
django.db.migrations.exceptions.InconsistentMigrationHistory: Migration admin.0001_initial is applied before its dependency account.0001_initial on database 'default'.
```

**Parser should extract:**
- level: `error`
- error_type: `django-inconsistent-migration-history`
- file: `manage.py`
- line: `22`
- message: `Migration admin.0001_initial is applied before its dependency account.0001_initial on database 'default'.`

---

## 2. npm audit Parser

### 2a. npm audit — Vulnerability summary (v6 format)

**Source:** https://stackoverflow.com/questions/54007613/trying-to-make-sense-of-npm-audit-results

```
found 356 vulnerabilities (321 low, 20 moderate, 14 high, 1 critical)
in 11345 scanned packages
  run `npm audit fix` to fix 3 of them.
  353 vulnerabilities require semver-major dependency updates.
```

**Parser should extract:**
- level: `warn`
- error_type: `npm-audit-vulnerabilities`
- total: `356`
- low: `321`
- moderate: `20`
- high: `14`
- critical: `1`
- packages_scanned: `11345`

---

### 2b. npm audit — Reduced vulnerability count

**Source:** https://stackoverflow.com/questions/54007613/trying-to-make-sense-of-npm-audit-results

```
found 71 vulnerabilities (36 low, 20 moderate, 14 high, 1 critical) in 11345 scanned packages
  71 vulnerabilities require semver-major dependency updates.
```

**Parser should extract:**
- level: `warn`
- error_type: `npm-audit-vulnerabilities`
- total: `71`
- low: `36`
- moderate: `20`
- high: `14`
- critical: `1`

---

### 2c. npm audit — Detailed advisory (v6 table format)

**Source:** https://stackoverflow.com/questions/55638180/how-to-fix-npm-package-tar-with-high-vulnerability-about-arbitrary-file-overwri

```
High......................... Arbitrary File Overwrite
Package...................... tar
Patched in................... >=4.4.2
Dependency of................ node-sass [dev]
Path......................... node-sass > node-gyp > tar
More info.................... https://npmjs.com/advisories/803
```

**Parser should extract:**
- level: `warn`
- error_type: `npm-audit-advisory`
- severity: `high`
- vulnerability: `Arbitrary File Overwrite`
- package: `tar`
- patched_in: `>=4.4.2`
- dependency_of: `node-sass`
- path: `node-sass > node-gyp > tar`

---

### 2d. npm audit — Modern summary format (npm v7+)

**Source:** https://stackoverflow.com/questions/69575813/vulnerabilities-with-create-react-app-react-js

```
58 vulnerabilities (16 moderate, 40 high, 2 critical)
```

**Parser should extract:**
- level: `warn`
- error_type: `npm-audit-vulnerabilities`
- total: `58`
- moderate: `16`
- high: `40`
- critical: `2`

---

### 2e. npm install — Vulnerability warning after install

**Source:** https://stackoverflow.com/questions/70229783/npm-install-issue-27-vulnerabilities-16-moderate-9-high-2-critical

```
27 vulnerabilities (16 moderate, 9 high, 2 critical)

To address all issues, run:
  npm audit fix --force
```

**Parser should extract:**
- level: `warn`
- error_type: `npm-audit-vulnerabilities`
- total: `27`
- moderate: `16`
- high: `9`
- critical: `2`

---

## 3. Coverage Parser

### 3a. Istanbul/nyc — Text table report

**Source:** https://stackoverflow.com/questions/26618243/how-do-i-read-an-istanbul-coverage-report

```
-------------------|-----------|-----------|-----------|-----------|
File               |   % Stmts |% Branches |   % Funcs |   % Lines |
-------------------|-----------|-----------|-----------|-----------|
   controllers/    |      88.1 |     77.78 |     78.57 |      88.1 |
      dashboard.js |      88.1 |     77.78 |     78.57 |      88.1 |
-------------------|-----------|-----------|-----------|-----------|
All files          |      88.1 |     77.78 |     78.57 |      88.1 |
-------------------|-----------|-----------|-----------|-----------|
```

**Parser should extract:**
- level: `info`
- error_type: `coverage-report`
- format: `istanbul-text`
- summary: `{ statements: 88.1, branches: 77.78, functions: 78.57, lines: 88.1 }`

---

### 3b. Istanbul/nyc — Coverage summary reporter

**Source:** https://stackoverflow.com/questions/39658439/how-do-i-extract-test-coverage-from-the-istanbul-text-summary-reporter-with-a-re

```
=============================== Coverage summary ===============================
Statements   : 53.07% ( 95/179 )
Branches     : 66.67% ( 28/42 )
Functions    : 30.99% ( 22/71 )
Lines        : 50.96% ( 80/157 )
================================================================================
```

**Parser should extract:**
- level: `info`
- error_type: `coverage-summary`
- format: `istanbul-summary`
- statements: `53.07`
- branches: `66.67`
- functions: `30.99`
- lines: `50.96`
- statements_detail: `95/179`
- branches_detail: `28/42`
- functions_detail: `22/71`
- lines_detail: `80/157`

---

### 3c. pytest-cov — Terminal report

**Source:** https://pytest-cov.readthedocs.io/en/latest/xdist.html (official docs)

```
-------------------- coverage: platform linux2, python 2.6.4-final-0 ---------------------
Name                 Stmts   Miss  Cover
----------------------------------------
myproj/__init__          2      0   100%
myproj/myproj          257     13    94%
myproj/feature4286      94      7    92%
----------------------------------------
TOTAL                  353     20    94%
```

**Parser should extract:**
- level: `info`
- error_type: `coverage-report`
- format: `pytest-cov`
- total_statements: `353`
- total_miss: `20`
- total_cover: `94`

---

### 3d. pytest-cov — With Missing column

**Source:** https://stackoverflow.com/questions/55293195/what-is-pytest-result-mean

```
---------- coverage: platform linux, python 3.7-final-0 -----------
Name                                    Stmts   Miss  Cover   Missing
----------------------------------------------------------------------------------------------
myProject/__init__.py                       0      0   100%
myProject/alert.py                         14     14     0%   1-21
myProject/api/__init__.py                   1      0   100%
myProject/api/spaces/admin.py             279    179    36%   154-223, 312-335, 351-398, 422-432, 505-515, 534-565, 591-697
```

**Parser should extract:**
- level: `info`
- error_type: `coverage-report`
- format: `pytest-cov`
- files with low coverage flagged (e.g., `alert.py` at 0%, `admin.py` at 36%)

---

## 4. Celery Parser

### 4a. Celery — Task raised unexpected error (WorkerLostError)

**Source:** https://stackoverflow.com/questions/24862738/celery-exiting-with-signal-11

```
[2014-07-02 15:00:44,765: ERROR/MainProcess] Process 'Worker-2' pid:23317 exited with 'signal 11 (SIGSEGV)'
[2014-07-02 15:00:44,797: ERROR/MainProcess] Task mbox.retrieve_by_message_id[e70fc4f9-585e-4993-a43b-35942052bf2a] raised unexpected: WorkerLostError('Worker exited prematurely: signal 11 (SIGSEGV).')
```

**Parser should extract:**
- level: `error`
- error_type: `celery-task-raised`
- task_name: `mbox.retrieve_by_message_id`
- task_id: `e70fc4f9-585e-4993-a43b-35942052bf2a`
- exception: `WorkerLostError`
- message: `Worker exited prematurely: signal 11 (SIGSEGV).`
- timestamp: `2014-07-02 15:00:44,797`
- process: `MainProcess`

---

### 4b. Celery — Task handler raised ValueError

**Source:** https://stackoverflow.com/questions/45744992/celery-raises-valueerror-not-enough-values-to-unpack

```
[2017-08-18 00:01:08,632: ERROR/MainProcess] Task handler raised error: ValueError('not enough values to unpack (expected 3, got 0)',)
Traceback (most recent call last):
  File "c:\users\user\celenv\lib\site-packages\billiard\pool.py", line 358, in workloop
    result = (True, prepare_result(fun(*args, **kwargs)))
  File "c:\users\user\celenv\lib\site-packages\celery\app\trace.py", line 525, in _fast_trace_task
    tasks, accept, hostname = _loc
ValueError: not enough values to unpack (expected 3, got 0)
```

**Parser should extract:**
- level: `error`
- error_type: `celery-task-raised`
- exception: `ValueError`
- message: `not enough values to unpack (expected 3, got 0)`
- file: `celery/app/trace.py`
- line: `525`
- timestamp: `2017-08-18 00:01:08,632`

---

### 4c. Celery — TimeLimitExceeded

**Source:** https://stackoverflow.com/questions/74289118/celery-soft-time-limit-not-triggered

```
Traceback (most recent call last):
  File "/usr/local/lib/python3.8/site-packages/billiard/pool.py", line 684, in on_hard_timeout
    raise TimeLimitExceeded(job._timeout)
billiard.exceptions.TimeLimitExceeded: TimeLimitExceeded(32,)
```

**Parser should extract:**
- level: `error`
- error_type: `celery-time-limit-exceeded`
- exception: `TimeLimitExceeded`
- timeout: `32`
- file: `billiard/pool.py`
- line: `684`

---

### 4d. Celery — Task succeeded (from official docs log format)

**Source:** https://docs.celeryq.dev/en/latest/userguide/tasks.html (Logging section)

```
[2024-01-15 10:30:45,123: INFO/MainProcess] Task tasks.add[f59d71ca-1549-43e0-be41-4e8821a83c0c] succeeded in 0.0235s: 16
```

**Parser should extract:**
- level: `info`
- error_type: `celery-task-succeeded`
- task_name: `tasks.add`
- task_id: `f59d71ca-1549-43e0-be41-4e8821a83c0c`
- duration: `0.0235`
- result: `16`

---

### 4e. Celery — Task retry (from official docs retry pattern)

**Source:** https://docs.celeryq.dev/en/latest/userguide/tasks.html (Retrying section)

```
[2024-01-15 10:30:45,456: INFO/MainProcess] Task tasks.send_twitter_status[a1b2c3d4-e5f6-7890-abcd-ef1234567890] retry: Retry in 180s: FailWhaleError()
```

**Parser should extract:**
- level: `info`
- error_type: `celery-task-retry`
- task_name: `tasks.send_twitter_status`
- task_id: `a1b2c3d4-e5f6-7890-abcd-ef1234567890`
- retry_in: `180`
- exception: `FailWhaleError`

---

## 5. Sidekiq Parser

### 5a. Sidekiq — Standard log format (start/done)

**Source:** https://github.com/sidekiq/sidekiq/wiki/Logging (official wiki)

```
2019-08-31T15:36:07.569Z pid=82859 tid=11cy9br class=HardWorker jid=528f1b0ddc4a9d0690464fe4 INFO: start
2019-08-31T15:36:07.573Z pid=82859 tid=119pz7z class=HardWorker jid=b7f805c545c78770d30dc1fd elapsed=0.089 INFO: done
```

**Parser should extract (line 1):**
- level: `info`
- error_type: `sidekiq-job-start`
- timestamp: `2019-08-31T15:36:07.569Z`
- pid: `82859`
- tid: `11cy9br`
- class: `HardWorker`
- jid: `528f1b0ddc4a9d0690464fe4`

**Parser should extract (line 2):**
- level: `info`
- error_type: `sidekiq-job-done`
- timestamp: `2019-08-31T15:36:07.573Z`
- pid: `82859`
- tid: `119pz7z`
- class: `HardWorker`
- jid: `b7f805c545c78770d30dc1fd`
- elapsed: `0.089`

---

### 5b. Sidekiq — Startup log

**Source:** https://gist.github.com/danishsatkut/1c43401588f45368569499c3eae2982b

```
2023-08-07T08:56:37.049Z pid=3981 tid=511 INFO: Running in ruby 3.1.4p223 (2023-03-30 revision 63029) [x86_64-linux]
2023-08-07T08:56:37.049Z pid=3981 tid=511 INFO: See LICENSE and the LGPL-3.0 for licensing details.
2023-08-07T08:56:37.049Z pid=3981 tid=511 INFO: Upgrade to Sidekiq Pro for more features and support: https://sidekiq.org
2023-08-07T08:56:37.049Z pid=3981 tid=511 INFO: Sidekiq 7.1.1 connecting to Redis with options {:size=>10, :pool_name=>"internal", :url=>nil}
```

**Parser should extract:**
- level: `info`
- error_type: `sidekiq-startup`
- version: `7.1.1`
- pid: `3981`

---

### 5c. Sidekiq — JSON log format

**Source:** https://github.com/sidekiq/sidekiq/wiki/Logging (official wiki)

```json
{"ts":"2019-09-01T22:34:59.778Z","pid":90069,"tid":"104v8ph","lvl":"INFO","msg":"Booting Sidekiq 6.0.0 with redis options {:id=>\"Sidekiq-server-PID-90069\", :url=>nil}"}
{"ts":"2019-09-01T22:34:59.807Z","pid":90069,"tid":"104v8ph","lvl":"INFO","msg":"Starting processing, hit Ctrl-C to stop"}
```

**Parser should extract:**
- level: `info`
- error_type: `sidekiq-startup`
- version: `6.0.0`
- pid: `90069`
- message: `Booting Sidekiq 6.0.0 with redis options...`

---

### 5d. Sidekiq — WARN/ERROR/FATAL job failure

**Source:** https://github.com/sidekiq/sidekiq/wiki/Error-Handling (official wiki, standard error format)

```
2019-08-31T15:36:07.585Z pid=82859 tid=11cy98z class=HardWorker jid=fe849e00b8371b33a1e8f16f WARN: RuntimeError: Something went wrong
2019-08-31T15:36:07.585Z pid=82859 tid=11cy98z class=HardWorker jid=fe849e00b8371b33a1e8f16f WARN: /app/workers/hard_worker.rb:10:in `perform'
```

**Parser should extract:**
- level: `warn`
- error_type: `sidekiq-job-error`
- class: `HardWorker`
- jid: `fe849e00b8371b33a1e8f16f`
- exception: `RuntimeError`
- message: `Something went wrong`
- file: `/app/workers/hard_worker.rb`
- line: `10`

---

### 5e. Sidekiq — FATAL crash

**Source:** https://gist.github.com/yangchenyun/5849852 (Sidekiq crash logs)

```
2013-06-23T06:42:59Z 5765 TID-osgp4bj4g FATAL: NoMethodError: undefined method `perform' for #<EmailWorker:0x007f9b1a1b2c30>
2013-06-23T06:42:59Z 5765 TID-osgp4bj4g FATAL: /app/vendor/bundle/ruby/2.0.0/gems/sidekiq-2.12.4/lib/sidekiq/processor.rb:44:in `block (2 levels) in process'
```

**Parser should extract:**
- level: `fatal`
- error_type: `sidekiq-job-fatal`
- exception: `NoMethodError`
- message: `undefined method 'perform' for #<EmailWorker:0x007f9b1a1b2c30>`
- file: `sidekiq/processor.rb`
- line: `44`

---

## 6. BullMQ Parser

### 6a. BullMQ — Job stalled more than allowable limit

**Source:** https://docs.bullmq.io/guide/jobs/stalled (official docs)

```
Error: job stalled more than allowable limit
```

**Source (real-world):** https://github.com/OptimalBits/bull/issues/1822

```
Error: job stalled more than allowable limit
    at Scripts.moveToFinished (/node_modules/bull/lib/scripts.js:188:15)
    at processTicksAndRejections (internal/process/task_queues.js:97:5)
```

**Parser should extract:**
- level: `error`
- error_type: `bullmq-job-stalled`
- message: `job stalled more than allowable limit`

---

### 6b. BullMQ — Missing lock for job

**Source:** https://docs.bullmq.io/guide/troubleshooting (official docs)

```
Error: Missing lock for job 1234. moveToFinished.
```

**Source (real-world):** https://github.com/taskforcesh/bullmq/issues/1343

```
Error: Missing lock for job 84. failed
    at Worker.processJob (/node_modules/bullmq/dist/cjs/classes/worker.js:338:25)
```

**Source (real-world):** https://stackoverflow.com/questions/74906376/bullmq-throwing-missing-lock-for-job-jobid-failed

```
Error: Missing lock for job <jobId> failed
```

**Parser should extract:**
- level: `error`
- error_type: `bullmq-missing-lock`
- job_id: `1234` (or `84`)
- operation: `moveToFinished` (or `failed`)

---

### 6c. BullMQ — Max retries per request limit

**Source:** https://stackoverflow.com/questions/71908600/bull-reached-the-max-retries-per-request-limit

```
Error while handling task collect-metrics: Reached the max retries per request limit (which is 10). Refer to "maxRetriesPerRequest" option for details.
```

**Parser should extract:**
- level: `error`
- error_type: `bullmq-max-retries`
- task: `collect-metrics`
- message: `Reached the max retries per request limit (which is 10)`
- max_retries: `10`

---

### 6d. BullMQ — Job completed event (NestJS integration)

**Source:** https://stackoverflow.com/questions/79454066/dont-understand-strange-behaviour-of-nest-js-bullmq

```
Job 123 completed
```

(From `@OnGlobalQueueCompleted()` handler logging pattern)

**Parser should extract:**
- level: `info`
- error_type: `bullmq-job-completed`
- job_id: `123`

---

### 6e. BullMQ — Job failed event

**Source:** https://stackoverflow.com/questions/77333588/bullmq-facing-errors-where-jobs-are-being-processed-twice

```
Error: Job "abc" is not in the active state. failed
Error: Lock mismatch for job "abc."
```

**Parser should extract:**
- level: `error`
- error_type: `bullmq-job-failed`
- job_id: `abc`
- message: `Job "abc" is not in the active state. failed`

---

## Summary: Parser Extraction Patterns

| Parser | Key Regex Patterns | Signal Score |
|--------|-------------------|--------------|
| **Alembic** | `ERROR \[alembic`, `FAILED:`, `Can't locate revision` | high (50+) |
| **Django Migration** | `InconsistentMigrationHistory`, `django.db.migrations.exceptions` | high (50+) |
| **npm audit** | `found \d+ vulnerabilities`, `\d+ (low\|moderate\|high\|critical)` | medium (20-49) for low/moderate, high (50+) for critical |
| **Istanbul/nyc** | `Coverage summary`, `Statements\s*:`, `% Stmts`, `% Branches` | info (< 20) unless below threshold |
| **pytest-cov** | `coverage:`, `Stmts\s+Miss\s+Cover`, `TOTAL` | info (< 20) unless below threshold |
| **Celery** | `Task .+\[.+\] raised unexpected`, `Task .+\[.+\] succeeded`, `retry:`, `TimeLimitExceeded` | high for raised/timeout, low for succeeded |
| **Sidekiq** | `pid=\d+ tid=\w+`, `INFO: start`, `INFO: done`, `WARN:`, `ERROR:`, `FATAL:` | high for FATAL/ERROR, medium for WARN, low for done |
| **BullMQ** | `job stalled more than allowable limit`, `Missing lock for job`, `max retries per request` | high (50+) for stalled/lock errors |
