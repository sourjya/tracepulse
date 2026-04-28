/**
 * Unit tests for the Java error parser.
 *
 * Verifies detection and parsing of Java exceptions, stack traces, and
 * chained "Caused by:" exceptions. The Java parser handles output from
 * JVM-based applications (Java, Kotlin, Scala) where errors follow the
 * standard `Exception in thread` / stack frame format.
 *
 * @see src/parsers/java-parser.ts for the parser implementation
 */

import { describe, it, expect } from "vitest";
import { javaParser } from "@/parsers/java-parser";
import { MAX_STACK_FRAMES } from "@/constants/limits";

// ──────────────────────────────────────────────
// canParse — positive matches
// ──────────────────────────────────────────────

describe("javaParser.canParse", () => {
  it("detects 'Exception in thread' pattern", () => {
    expect(
      javaParser.canParse(
        'Exception in thread "main" java.lang.NullPointerException',
      ),
    ).toBe(true);
  });

  it("detects Java exception class patterns", () => {
    expect(
      javaParser.canParse("java.lang.NullPointerException: some message"),
    ).toBe(true);
    expect(
      javaParser.canParse(
        "java.io.FileNotFoundException: /tmp/missing.txt (No such file or directory)",
      ),
    ).toBe(true);
  });

  it("detects 'at com.' stack frame patterns", () => {
    expect(
      javaParser.canParse(
        "\tat com.example.MyClass.myMethod(MyClass.java:42)",
      ),
    ).toBe(true);
  });

  it("detects 'at org.' stack frame patterns", () => {
    expect(
      javaParser.canParse(
        "\tat org.springframework.web.servlet.DispatcherServlet.doDispatch(DispatcherServlet.java:1067)",
      ),
    ).toBe(true);
  });

  it("detects 'Caused by:' lines", () => {
    expect(
      javaParser.canParse(
        "Caused by: java.sql.SQLException: Connection refused",
      ),
    ).toBe(true);
  });

  // ──────────────────────────────────────────────
  // canParse — negative matches
  // ──────────────────────────────────────────────

  it("returns false for Node.js errors", () => {
    expect(
      javaParser.canParse("TypeError: Cannot read properties of undefined"),
    ).toBe(false);
    expect(
      javaParser.canParse(
        "    at Object.<anonymous> (/app/src/index.js:10:5)",
      ),
    ).toBe(false);
  });

  it("returns false for Python errors", () => {
    expect(
      javaParser.canParse('  File "/app/main.py", line 42, in <module>'),
    ).toBe(false);
    expect(javaParser.canParse("ImportError: No module named 'flask'")).toBe(
      false,
    );
  });

  it("returns false for Go errors", () => {
    expect(
      javaParser.canParse("goroutine 1 [running]: main.main()"),
    ).toBe(false);
    expect(javaParser.canParse("panic: runtime error: index out of range")).toBe(
      false,
    );
  });

  it("returns false for plain text", () => {
    expect(javaParser.canParse("Server started on port 8080")).toBe(false);
  });
});

// ──────────────────────────────────────────────
// parse — exception extraction
// ──────────────────────────────────────────────

describe("javaParser.parse", () => {
  it("parses 'Exception in thread' with NullPointerException", () => {
    const line =
      'Exception in thread "main" java.lang.NullPointerException: value is null';
    const result = javaParser.parse(line);

    expect(result).not.toBeNull();
    expect(result!.message).toContain("NullPointerException");
    expect(result!.message).toContain("value is null");
    expect(result!.level).toBe("error");
    expect(result!.context.framework).toBe("java");
    expect(result!.context.error_type).toBe("NullPointerException");
    expect(result!.scoring_hints.is_unhandled_exception).toBe(true);
    expect(result!.scoring_hints.has_stack_trace).toBe(false);
  });

  it("parses exception with no detail message", () => {
    const line =
      'Exception in thread "main" java.lang.NullPointerException';
    const result = javaParser.parse(line);

    expect(result).not.toBeNull();
    expect(result!.message).toContain("NullPointerException");
    expect(result!.context.error_type).toBe("NullPointerException");
  });

  // ──────────────────────────────────────────────
  // parse — stack frame extraction
  // ──────────────────────────────────────────────

  it("extracts file and line from user code stack frames", () => {
    const line = [
      'Exception in thread "main" java.lang.RuntimeException: boom',
      "\tat com.example.MyClass.myMethod(MyClass.java:42)",
      "\tat com.example.App.main(App.java:10)",
    ].join("\n");
    const result = javaParser.parse(line);

    expect(result).not.toBeNull();
    expect(result!.context.file).toBe("MyClass.java");
    expect(result!.context.line).toBe(42);
    expect(result!.scoring_hints.has_stack_trace).toBe(true);
    expect(result!.scoring_hints.is_user_code).toBe(true);
  });

  it("includes stack trace string in result", () => {
    const line = [
      "java.lang.IllegalArgumentException: bad input",
      "\tat com.example.Service.validate(Service.java:55)",
    ].join("\n");
    const result = javaParser.parse(line);

    expect(result).not.toBeNull();
    expect(result!.stack_trace).toContain("com.example.Service.validate");
  });

  // ──────────────────────────────────────────────
  // parse — JDK internal frame skipping
  // ──────────────────────────────────────────────

  it("skips JDK internal frames when determining user code", () => {
    const line = [
      "java.lang.NullPointerException: oops",
      "\tat java.lang.String.valueOf(String.java:3042)",
      "\tat sun.reflect.NativeMethodAccessorImpl.invoke(NativeMethodAccessorImpl.java:62)",
      "\tat jdk.internal.reflect.NativeMethodAccessorImpl.invoke(NativeMethodAccessorImpl.java:77)",
    ].join("\n");
    const result = javaParser.parse(line);

    expect(result).not.toBeNull();
    // No user code frames — only JDK internals
    expect(result!.scoring_hints.is_user_code).toBe(false);
    // file/line should not be set from JDK frames
    expect(result!.context.file).toBeUndefined();
  });

  it("picks user code frame over JDK frames", () => {
    const line = [
      "java.lang.NullPointerException",
      "\tat java.lang.String.valueOf(String.java:3042)",
      "\tat com.myapp.Handler.process(Handler.java:99)",
      "\tat jdk.internal.reflect.NativeMethodAccessorImpl.invoke(NativeMethodAccessorImpl.java:77)",
    ].join("\n");
    const result = javaParser.parse(line);

    expect(result).not.toBeNull();
    expect(result!.context.file).toBe("Handler.java");
    expect(result!.context.line).toBe(99);
    expect(result!.scoring_hints.is_user_code).toBe(true);
  });

  // ──────────────────────────────────────────────
  // parse — Caused by: chained exceptions
  // ──────────────────────────────────────────────

  it("uses root cause from 'Caused by:' chain", () => {
    const line = [
      "org.springframework.beans.factory.BeanCreationException: Error creating bean",
      "\tat org.springframework.beans.factory.support.AbstractBeanFactory.getBean(AbstractBeanFactory.java:200)",
      "Caused by: java.sql.SQLException: Connection refused",
      "\tat com.mysql.cj.jdbc.ConnectionImpl.createNewIO(ConnectionImpl.java:836)",
      "Caused by: java.net.ConnectException: Connection refused (Connection refused)",
      "\tat com.myapp.db.Pool.connect(Pool.java:23)",
    ].join("\n");
    const result = javaParser.parse(line);

    expect(result).not.toBeNull();
    // Root cause is the last "Caused by:" — ConnectException
    expect(result!.context.error_type).toBe("ConnectException");
    expect(result!.message).toContain("ConnectException");
    expect(result!.message).toContain("Connection refused");
    expect(result!.context.file).toBe("Pool.java");
    expect(result!.context.line).toBe(23);
  });

  it("handles Caused by: with no further stack frames", () => {
    const line = [
      "java.lang.RuntimeException: wrapper",
      "Caused by: java.io.IOException: disk full",
    ].join("\n");
    const result = javaParser.parse(line);

    expect(result).not.toBeNull();
    expect(result!.context.error_type).toBe("IOException");
    expect(result!.message).toContain("disk full");
  });

  // ──────────────────────────────────────────────
  // parse — standalone patterns
  // ──────────────────────────────────────────────

  it("parses a standalone exception class line", () => {
    const line = "java.lang.OutOfMemoryError: Java heap space";
    const result = javaParser.parse(line);

    expect(result).not.toBeNull();
    expect(result!.context.error_type).toBe("OutOfMemoryError");
    expect(result!.message).toContain("Java heap space");
  });

  it("parses a standalone Caused by: line", () => {
    const line = "Caused by: java.lang.ClassNotFoundException: com.example.Missing";
    const result = javaParser.parse(line);

    expect(result).not.toBeNull();
    expect(result!.context.error_type).toBe("ClassNotFoundException");
  });

  it("returns null for a line with only stack frames and no exception", () => {
    const line = "\tat com.example.MyClass.myMethod(MyClass.java:42)";
    const result = javaParser.parse(line);

    // A bare stack frame with no exception line — parser extracts what it can
    // but there's no exception message to extract
    expect(result).not.toBeNull();
    expect(result!.context.file).toBe("MyClass.java");
    expect(result!.context.line).toBe(42);
    expect(result!.scoring_hints.has_stack_trace).toBe(true);
  });
});
