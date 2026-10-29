package fun.commons.gateway4j.engine.plugin.loader;

import groovy.lang.GroovyClassLoader;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Sandbox rejection matrix (ADR-003: Groovy 插件运行于沙箱). Malicious scripts
 * must fail COMPILATION (fail-closed) — never reach instantiation or execution.
 * The constructor-body / field-initializer blind spots of the stock
 * SecureASTCustomizer are covered too (they are the non-obvious holes).
 */
class GroovySandboxTest {

    private static java.util.List<Class<?>> compile(String script) {
        try (GroovyClassLoader loader = new GroovyClassLoader(
                GroovySandboxTest.class.getClassLoader(), GroovySandbox.secureCompilerConfiguration())) {
            GroovySandbox.compileSandboxed(loader, script, "gw4j/sandbox/test.groovy");
            return java.util.Arrays.asList(loader.getLoadedClasses());
        } catch (java.io.IOException e) {
            throw new IllegalStateException(e);
        }
    }

    private static void assertRejected(String label, String script) {
        assertThrows(Exception.class, () -> compile(script),
                () -> label + " must be rejected at compile time but compiled cleanly: " + script);
    }

    // --- the three required denial vectors -----------------------------------

    @Test
    void systemExitIsRejected() {
        assertRejected("System.exit", """
                class Evil implements Runnable {
                    void run() { System.exit(1) }
                }
                """);
    }

    @Test
    void fileConstructorIsRejected() {
        assertRejected("new File", """
                class Evil {
                    def f = new File("/tmp/evil")
                }
                """);
    }

    @Test
    void stringExecuteProcessIsRejected() {
        assertRejected("process exec", """
                class Evil {
                    def out() { "ls".execute().text }
                }
                """);
    }

    // --- the blind spots + evasions ------------------------------------------

    @Test
    void constructorBodyExecutionIsRejected() {
        // SecureASTCustomizer never visits constructor bodies — the guard customizer must
        assertRejected("ctor body exec", """
                class Evil {
                    Evil() { "whoami".execute() }
                    String ok() { "fine" }
                }
                """);
    }

    @Test
    void fieldInitializerExecutionIsRejected() {
        assertRejected("field init exec", """
                class Evil {
                    static def OUT = "ls".execute()
                }
                """);
    }

    @Test
    void runtimeGetRuntimeIsRejected() {
        assertRejected("Runtime.getRuntime", """
                class Evil {
                    def r() { Runtime.getRuntime().exec("ls") }
                }
                """);
    }

    @Test
    void reflectionForNameIsRejected() {
        assertRejected("Class.forName", """
                class Evil {
                    Object c() { Class.forName("java.lang.Runtime") }
                }
                """);
    }

    @Test
    void dynamicMethodNameDispatchIsRejected() {
        // "exe" + "cute" assembled at runtime — defeats any static name denylist
        assertRejected("GString method name", """
                class Evil {
                    def p() { def m = "exe"; def s = "cute"; "ls"."${m}${s}"() }
                }
                """);
    }

    @Test
    void processBuilderIsRejected() {
        assertRejected("ProcessBuilder", """
                class Evil {
                    def p() { new ProcessBuilder("sh", "-c", "id").redirectErrorStream(true) }
                }
                """);
    }

    @Test
    void threadStartIsRejected() {
        assertRejected("Thread.start", """
                class Evil {
                    def go() { Thread.start { println "boom" } }
                }
                """);
    }

    @Test
    void systemGetPropertyIsRejected() {
        assertRejected("env probing", """
                class Evil {
                    String d() { System.getProperty("user.dir") }
                }
                """);
    }

    @Test
    void metaClassTamperingIsRejected() {
        assertRejected("metaClass", """
                class Evil {
                    def t() { String.metaClass.foo = { "x" } }
                }
                """);
    }

    @Test
    void castToFileIsRejected() {
        assertRejected("as File", """
                class Evil {
                    def f(Object o) { o as java.io.File }
                }
                """);
    }

    @Test
    void packageDeclarationIsRejected() {
        assertRejected("package", """
                package java.lang
                class Evil {
                    String s() { "hi" }
                }
                """);
    }

    // --- positive control: a legitimate plugin script compiles ---------------

    @Test
    void legitimatePluginScriptCompiles() {
        java.util.List<Class<?>> classes = compile(LoaderTestFixtures.LEGIT_SCRIPT);
        boolean found = false;
        for (Class<?> clazz : classes) {
            if (fun.commons.gateway4j.plugin.api.GatewayPlugin.class.isAssignableFrom(clazz)) {
                found = true;
            }
        }
        assertTrue(found, "legit script must compile and contain a GatewayPlugin implementation, got: "
                + classes);
    }

    @Test
    void legitScriptWithClosureAndGStringCompiles() {
        java.util.List<Class<?>> classes = compile("""
                import fun.commons.gateway4j.plugin.api.*
                import org.springframework.web.server.ServerWebExchange
                import reactor.core.publisher.Mono

                class ClosurePlugin implements GatewayPlugin {
                    String pluginId() { 'groovy.closure' }
                    String pluginName() { 'closure' }
                    String phase() { 'PRE' }
                    int order() { 0 }
                    Mono<Void> execute(ServerWebExchange exchange, PluginChain chain) {
                        def items = ['a', 'b', 'c']
                        def joined = items.collect { it.toUpperCase() }.join('-')
                        exchange.getAttributes().put('gw4j:joined', "joined=${joined}")
                        return chain.execute(exchange)
                    }
                }
                """);
        assertTrue(classes.size() >= 2, "script + declared class expected");
    }
}
