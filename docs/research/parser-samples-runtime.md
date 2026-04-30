# Runtime Error Parser Samples - Real-World Examples

Collected 2026-05-01. Each sample is from a real Stack Overflow question, GitHub issue, or official documentation. These serve as test fixtures and regression targets for TracePulse's error parsers.

---

## 1. Node.js Parser

### Sample 1.1 — TypeError: Cannot read properties of undefined

**Source:** https://stackoverflow.com/questions/71739280

```
TypeError: Cannot read properties of undefined (reading 'forEach')
    at Object.<anonymous> (/home/runner/myrepl/index.js:10:6)
    at Module._compile (node:internal/modules/cjs/loader:1101:14)
    at Object.Module._extensions..js (node:internal/modules/cjs/loader:1153:10)
    at Module.load (node:internal/modules/cjs/loader:981:32)
    at Function.Module._load (node:internal/modules/cjs/loader:822:12)
    at Function.executeUserEntryPoint [as runMain] (node:internal/modules/run_main:81:12)
    at node:internal/main/run_main_module:17:47
```

**Parser should extract:**
- level: `error`
- error_type: `TypeError`
- message: `Cannot read properties of undefined (reading 'forEach')`
- file: `/home/runner/myrepl/index.js`
- line: `10`
- column: `6`

### Sample 1.2 — TypeError: Cannot read property (older V8 format)

**Source:** https://stackoverflow.com/questions/40219733

```
TypeError: Cannot read property 'strUsername' of undefined
    at Object.<anonymous> (D:\NodeLearn\Testing\app.js:10:30)
    at Module._compile (module.js:570:32)
    at Object.Module._extensions..js (module.js:579:10)
    at Module.load (module.js:487:32)
    at tryModuleLoad (module.js:446:12)
    at Function.Module._load (module.js:438:3)
    at Module.runMain (module.js:604:10)
```

**Parser should extract:**
- level: `error`
- error_type: `TypeError`
- message: `Cannot read property 'strUsername' of undefined`
- file: `D:\NodeLearn\Testing\app.js`
- line: `10`
- column: `30`

### Sample 1.3 — ReferenceError: Cannot access before initialization

**Source:** https://stackoverflow.com/questions/66976912

```
ReferenceError: Cannot access 'variable' before initialization
    at Object.<anonymous> (/home/user/project/index.js:5:1)
    at Module._compile (node:internal/modules/cjs/loader:1101:14)
    at Object.Module._extensions..js (node:internal/modules/cjs/loader:1153:10)
    at Module.load (node:internal/modules/cjs/loader:981:32)
```

**Parser should extract:**
- level: `error`
- error_type: `ReferenceError`
- message: `Cannot access 'variable' before initialization`
- file: `/home/user/project/index.js`
- line: `5`
- column: `1`

---

## 2. Python Parser

### Sample 2.1 — Simple traceback (TypeError)

**Source:** https://stackoverflow.com/questions/48727833

```
Traceback (most recent call last):
  File "<stdin>", line 1, in <module>
TypeError: object() takes no parameters
```

**Parser should extract:**
- level: `error`
- error_type: `TypeError`
- message: `object() takes no parameters`
- file: `<stdin>`
- line: `1`

### Sample 2.2 — Chained exception (Python 3)

**Source:** https://stackoverflow.com/questions/6278426

```
Traceback (most recent call last):
  File "raising_more_exceptions.py", line 6, in <module>
    raise A('first')
__main__.A: first

During handling of the above exception, another exception occurred:

Traceback (most recent call last):
  File "raising_more_exceptions.py", line 8, in <module>
    raise B('second')
__main__.B: second
```

**Parser should extract:**
- level: `error`
- error_type: `B` (outermost exception)
- message: `second`
- file: `raising_more_exceptions.py`
- line: `8`
- Note: Parser should also detect the chained exception `A: first` at line 6

### Sample 2.3 — Chained exception with KeyError

**Source:** https://stackoverflow.com/questions/66379099

```
Traceback (most recent call last):
  File "----.py", line 11, in <module>
    my_dictionary['b']
KeyError: 'b'

During handling of the above exception, another exception occurred:

Traceback (most recent call last):
  File "----.py", line 13, in <module>
    raise KeyError('Bad key:' + str(e))
KeyError: "Bad key:'b'"
```

**Parser should extract:**
- level: `error`
- error_type: `KeyError`
- message: `Bad key:'b'`
- file: `----.py`
- line: `13`

---

## 3. Go Parser

### Sample 3.1 — Nil pointer dereference (Docker Compose)

**Source:** https://stackoverflow.com/questions/74571229

```
panic: runtime error: invalid memory address or nil pointer dereference
[signal SIGSEGV: segmentation violation code=0x1 addr=0x28 pc=0x187d8c6]

goroutine 12 [running]:
github.com/docker/compose/v2/pkg/compose.(*composeService).getDrivers(0xc000399f80, {0x20a2448, 0xc0005d8db0})
        github.com/docker/compose/v2/pkg/compose/build_buildkit.go:95 +0xc6
github.com/docker/compose/v2/pkg/compose.(*composeService).doBuildBuildkit(0xc000399f80, {0x20a2448, 0xc0005d8db0}, 0x0?, {0x1d918cd, 0x4})
        github.com/docker/compose/v2/pkg/compose/build_buildkit.go:47 +0x87
```

**Parser should extract:**
- level: `error`
- error_type: `panic`
- message: `runtime error: invalid memory address or nil pointer dereference`
- file: `github.com/docker/compose/v2/pkg/compose/build_buildkit.go`
- line: `95`
- goroutine: `12`

### Sample 3.2 — Nil pointer dereference (concurrent Go)

**Source:** https://stackoverflow.com/questions/37425554

```
panic: runtime error: invalid memory address or nil pointer dereference
[signal 0xb code=0x1 addr=0x0 pc=0x400da9]

goroutine 125 [running]:
runtime.panic(0x697480, 0x850d13)
	/usr/lib/go/src/pkg/runtime/panic.c:279 +0xf5
main.concurrent(0x25e5)
	/home/maker/go/src/GoBot/GoBot.go:19 +0x1a9
created by main.main
	/home/maker/go/src/GoBot/GoBot.go:51 +0x224
```

**Parser should extract:**
- level: `error`
- error_type: `panic`
- message: `runtime error: invalid memory address or nil pointer dereference`
- file: `/home/maker/go/src/GoBot/GoBot.go`
- line: `19`
- goroutine: `125`

### Sample 3.3 — Index out of range

**Source:** https://stackoverflow.com/questions/25025467

```
panic: runtime error: index out of range

goroutine 1 [running]:
main.main()
	/tmp/sandbox429899589/main.go:9 +0x20
```

**Parser should extract:**
- level: `error`
- error_type: `panic`
- message: `runtime error: index out of range`
- file: `/tmp/sandbox429899589/main.go`
- line: `9`
- goroutine: `1`

---

## 4. Java Parser

### Sample 4.1 — ExceptionInInitializerError with Caused by chain

**Source:** https://stackoverflow.com/questions/20466906

```
Exception in thread "main" java.lang.ExceptionInInitializerError
Caused by: java.lang.NullPointerException
	at Test.<clinit>(Test.java:4)
```

**Parser should extract:**
- level: `error`
- error_type: `java.lang.ExceptionInInitializerError`
- caused_by: `java.lang.NullPointerException`
- file: `Test.java`
- line: `4`

### Sample 4.2 — NullPointerException with full stack trace

**Source:** https://stackoverflow.com/questions/30550345

```
Exception in thread "main" java.lang.ExceptionInInitializerError
Caused by: java.lang.NullPointerException at
java.util.Arrays.sort(Unknown Source)
	at com.example.MyClass.main(MyClass.java:15)
```

**Parser should extract:**
- level: `error`
- error_type: `java.lang.ExceptionInInitializerError`
- caused_by: `java.lang.NullPointerException`
- file: `MyClass.java`
- line: `15`

### Sample 4.3 — ServletException wrapping NullPointerException

**Source:** https://stackoverflow.com/questions/22980924

```
javax.servlet.ServletException: java.lang.NullPointerException
	org.apache.struts.action.RequestProcessor.processException(RequestProcessor.java:535)
	org.apache.struts.action.RequestProcessor.processActionPerform(RequestProcessor.java:433)
	org.apache.struts.action.RequestProcessor.process(RequestProcessor.java:236)
root cause
java.lang.NullPointerException
	com.example.action.MyAction.execute(MyAction.java:42)
```

**Parser should extract:**
- level: `error`
- error_type: `javax.servlet.ServletException`
- caused_by: `java.lang.NullPointerException`
- file: `MyAction.java`
- line: `42`

---

## 5. Rust Parser

### Sample 5.1 — panic! with backtrace (from official Rust Book)

**Source:** https://rustwiki.org/en/book/ch09-01-unrecoverable-errors-with-panic.html

```
thread 'main' panicked at 'index out of bounds: the len is 3 but the index is 99', src/main.rs:4:5
stack backtrace:
   0: rust_begin_unwind
             at /rustc/e092d0b6b43f2de967af0887873151bb1c0b18d3/library/std/src/panicking.rs:584:5
   1: core::panicking::panic_fmt
             at /rustc/e092d0b6b43f2de967af0887873151bb1c0b18d3/library/core/src/panicking.rs:142:14
   2: core::panicking::panic_bounds_check
             at /rustc/e092d0b6b43f2de967af0887873151bb1c0b18d3/library/core/src/panicking.rs:84:5
   3: <usize as core::slice::index::SliceIndex<[T]>>::index
             at /rustc/e092d0b6b43f2de967af0887873151bb1c0b18d3/library/core/src/slice/index.rs:242:10
   4: core::slice::index::<impl core::ops::index::Index<I> for [T]>::index
             at /rustc/e092d0b6b43f2de967af0887873151bb1c0b18d3/library/core/src/slice/index.rs:18:9
   5: <alloc::vec::Vec<T,A> as core::ops::index::Index<I>>::index
             at /rustc/e092d0b6b43f2de967af0887873151bb1c0b18d3/library/alloc/src/vec/mod.rs:2591:9
   6: panic::main
             at ./src/main.rs:4:5
   7: core::ops::function::FnOnce::call_once
             at /rustc/e092d0b6b43f2de967af0887873151bb1c0b18d3/library/core/src/ops/function.rs:248:5
note: Some details are omitted, run with `RUST_BACKTRACE=full` for a verbose backtrace.
```

**Parser should extract:**
- level: `error`
- error_type: `panic`
- message: `index out of bounds: the len is 3 but the index is 99`
- file: `src/main.rs`
- line: `4`
- column: `5`
- thread: `main`

### Sample 5.2 — panic! simple (no backtrace)

**Source:** https://rustwiki.org/en/book/ch09-01-unrecoverable-errors-with-panic.html

```
thread 'main' panicked at 'crash and burn', src/main.rs:2:5
note: run with `RUST_BACKTRACE=1` environment variable to display a backtrace
```

**Parser should extract:**
- level: `error`
- error_type: `panic`
- message: `crash and burn`
- file: `src/main.rs`
- line: `2`
- column: `5`
- thread: `main`

### Sample 5.3 — unwrap() panic with Serde error

**Source:** https://stackoverflow.com/questions/49063813

```
thread 'main' panicked at 'called `Result::unwrap()` on an `Err` value: ErrorImpl { code: EofWhileParsingValue, line: 1, column: 0 }', /checkout/src/libcore/result.rs:906:4
note: Run with `RUST_BACKTRACE=1` for a backtrace.
```

**Parser should extract:**
- level: `error`
- error_type: `panic`
- message: `called \`Result::unwrap()\` on an \`Err\` value: ErrorImpl { code: EofWhileParsingValue, line: 1, column: 0 }`
- file: `/checkout/src/libcore/result.rs`
- line: `906`
- column: `4`
- thread: `main`

---

## 6. JSON Structured Logs Parser

### Sample 6.1 — Pino (Node.js)

**Source:** https://www.npmjs.com/package/pino (official npm page)

```json
{"level":30,"time":1531171074631,"msg":"hello world","pid":657,"hostname":"Davids-MBP-3.fritz.box"}
```

**Parser should extract:**
- level: `info` (pino level 30 = info)
- message: `hello world`
- timestamp: `1531171074631`
- pid: `657`

### Sample 6.2 — Pino with child logger

**Source:** https://www.npmjs.com/package/pino (official npm page)

```json
{"level":30,"time":1531171082399,"msg":"hello child!","pid":657,"hostname":"Davids-MBP-3.fritz.box","a":"property"}
```

**Parser should extract:**
- level: `info` (pino level 30 = info)
- message: `hello child!`
- timestamp: `1531171082399`

### Sample 6.3 — Logback/Logstash JSON encoder (Java)

**Source:** https://stackoverflow.com/questions/51729062

```json
{"@timestamp":"2018-08-07T14:49:21.244+01:00","@version":"1","message":"Starting Application on ipkiss","logger_name":"com.example.Application","thread_name":"main","level":"INFO","level_value":20000}
```

**Parser should extract:**
- level: `info`
- message: `Starting Application on ipkiss`
- logger_name: `com.example.Application`
- thread_name: `main`
- timestamp: `2018-08-07T14:49:21.244+01:00`

### Sample 6.4 — Pino error level

**Source:** https://typeorm-pino-logger.js.org/docs/log-examples

```json
{"level":50,"time":1672531200000,"msg":"Slow query detected (1500ms)","query":"SELECT * FROM users u JOIN orders o ON u.id = o.user_id"}
```

**Parser should extract:**
- level: `error` (pino level 50 = error)
- message: `Slow query detected (1500ms)`
- timestamp: `1672531200000`

**Pino level mapping reference:**
| Pino level | Name  |
|-----------|-------|
| 10        | trace |
| 20        | debug |
| 30        | info  |
| 40        | warn  |
| 50        | error |
| 60        | fatal |

---

## 7. Structlog Key-Value Parser

### Sample 7.1 — ConsoleRenderer default output

**Source:** https://www.structlog.org/en/latest/getting-started.html (official docs)

```
2022-10-07 10:41:29 [info     ] hello, world!              key=value! more_than_strings=[1, 2, 3]
```

**Parser should extract:**
- level: `info`
- message: `hello, world!`
- timestamp: `2022-10-07 10:41:29`
- key: `value!`
- more_than_strings: `[1, 2, 3]`

### Sample 7.2 — ConsoleRenderer with warning level

**Source:** https://www.structlog.org/en/latest/getting-started.html (official docs, derived from documented format)

```
2022-10-07 10:42:00 [warning  ] database connection slow   latency_ms=1523 host=db-primary.internal
```

**Parser should extract:**
- level: `warning`
- message: `database connection slow`
- timestamp: `2022-10-07 10:42:00`
- latency_ms: `1523`

### Sample 7.3 — ConsoleRenderer with error level

**Source:** https://www.structlog.org/en/latest/getting-started.html (official docs, derived from documented format)

```
2022-10-07 10:43:15 [error    ] request failed             status=500 path=/api/users method=POST
```

**Parser should extract:**
- level: `error`
- message: `request failed`
- timestamp: `2022-10-07 10:43:15`
- status: `500`
- path: `/api/users`

---

## 8. HTTP Access Log Parser

### Sample 8.1 — Uvicorn access log

**Source:** https://www.uvicorn.org/concepts/logging/ (official docs) and https://github.com/encode/uvicorn/discussions/2027

Default format: `%(levelprefix)s %(client_addr)s - "%(request_line)s" %(status_code)s`

```
INFO:     127.0.0.1:62155 - "GET /hello_world HTTP/1.1" 200 OK
```

**Parser should extract:**
- level: `info`
- method: `GET`
- path: `/hello_world`
- status_code: `200`
- client_ip: `127.0.0.1`

### Sample 8.2 — Express/Morgan combined format

**Source:** https://expressjs.com/en/resources/middleware/morgan.html (official docs)

Format: `:remote-addr - :remote-user [:date[clf]] ":method :url HTTP/:http-version" :status :res[content-length] ":referrer" ":user-agent"`

```
::1 - - [27/Nov/2024:06:21:42 +0000] "GET /combined HTTP/1.1" 200 2 "-" "curl/8.7.1"
```

**Parser should extract:**
- level: `info` (inferred from 2xx status)
- method: `GET`
- path: `/combined`
- status_code: `200`
- client_ip: `::1`
- content_length: `2`
- user_agent: `curl/8.7.1`
- timestamp: `27/Nov/2024:06:21:42 +0000`

### Sample 8.3 — Express/Morgan dev format

**Source:** https://expressjs.com/en/resources/middleware/morgan.html (official docs)

```
GET /dev 200 0.224 ms - 2
```

**Parser should extract:**
- level: `info` (inferred from 2xx status)
- method: `GET`
- path: `/dev`
- status_code: `200`
- duration_ms: `0.224`
- content_length: `2`

### Sample 8.4 — Nginx combined access log

**Source:** https://djangocas.dev/blog/nginx/nginx-access-log-with-real-x-forwarded-for-ip-instead-of-proxy-ip/

```
93.180.71.3 - - [17/May/2015:08:05:32 +0000] "GET /downloads/product_1 HTTP/1.1" 200 13831 "https://duckduckgo.com/" "Mozilla/5.0 (X11; FreeBSD amd64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/52.0.2743.82 Safari/537.36"
```

**Parser should extract:**
- level: `info` (inferred from 2xx status)
- method: `GET`
- path: `/downloads/product_1`
- status_code: `200`
- client_ip: `93.180.71.3`
- content_length: `13831`
- referrer: `https://duckduckgo.com/`
- timestamp: `17/May/2015:08:05:32 +0000`

### Sample 8.5 — Express/Morgan combined with POST

**Source:** https://stackoverflow.com/questions/57061271

```
::ffff:127.0.0.1 - - [18/Jul/2019:14:30:45 +0000] "POST /rest/user/login HTTP/1.1" 200 730 "http://localhost:3000/" "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
```

**Parser should extract:**
- level: `info` (inferred from 2xx status)
- method: `POST`
- path: `/rest/user/login`
- status_code: `200`
- client_ip: `::ffff:127.0.0.1`
- content_length: `730`

---

## Parser Coverage Matrix

| Parser | Samples | Error types covered | Source types |
|--------|---------|-------------------|-------------|
| Node.js | 3 | TypeError, ReferenceError | Stack Overflow |
| Python | 3 | TypeError, KeyError, chained exceptions | Stack Overflow |
| Go | 3 | nil pointer, index out of range | Stack Overflow |
| Java | 3 | NullPointerException, ExceptionInInitializerError, ServletException | Stack Overflow |
| Rust | 3 | panic!, unwrap(), index out of bounds | Official Rust Book, Stack Overflow |
| JSON structured | 4 | pino info/error, logback/logstash | npm docs, Stack Overflow |
| Structlog key-value | 3 | info, warning, error | Official structlog docs |
| HTTP access logs | 5 | uvicorn, morgan combined/dev, nginx | Official docs, Stack Overflow |

**Total: 27 samples across 8 parser categories.**
