package fun.commons.gateway4j.engine.plugin.loader;

import org.codehaus.groovy.ast.ASTNode;
import org.codehaus.groovy.ast.ClassCodeVisitorSupport;
import org.codehaus.groovy.ast.ClassNode;
import org.codehaus.groovy.ast.ConstructorNode;
import org.codehaus.groovy.ast.FieldNode;
import org.codehaus.groovy.ast.MethodNode;
import org.codehaus.groovy.ast.expr.ConstructorCallExpression;
import org.codehaus.groovy.ast.expr.Expression;
import org.codehaus.groovy.ast.expr.MethodCallExpression;
import org.codehaus.groovy.ast.expr.PropertyExpression;
import org.codehaus.groovy.ast.expr.StaticMethodCallExpression;
import org.codehaus.groovy.control.CompilePhase;
import org.codehaus.groovy.control.SourceUnit;
import org.codehaus.groovy.control.customizers.CompilationCustomizer;

import java.security.AccessControlException;

/**
 * Second sandbox layer behind {@link SecureASTCustomizer} (ADR-003). Closes the
 * blind spots that the stock customizer does NOT cover in Groovy 4:
 *
 * <ul>
 *   <li><b>Constructor bodies and field initializers are never visited</b> by
 *       SecureASTCustomizer (it only walks {@code ClassNode.getMethods()} and the
 *       module statement block) — {@code class Evil { Evil() { "ls".execute() } }}
 *       would otherwise compile cleanly.</li>
 *   <li><b>Dynamic (GString / variable) method or property names</b> pass the stock
 *       receiver checks — {@code "ls"."${'exe'}cute"()} would bypass any name-based
 *       denylist — so dispatch targets must be compile-time constants.</li>
 *   <li><b>Method-name denylist</b> (Groovy 4 dropped the old methods whitelist):
 *       {@code exit/getRuntime/forName/newInstance/invokeMethod/evaluate/...}, and
 *       {@code execute} restricted to plugin-SDK receivers so {@code chain.execute}
 *       stays legal while {@code "ls".execute()} (process exec) is rejected.</li>
 *   <li><b>Property denylist</b> for meta-programming/IO handles
 *       ({@code metaClass/out/err/classLoader/...}) and a class gate on constructor /
 *       cast / array targets.</li>
 * </ul>
 *
 * <p>Every violation throws {@link AccessControlException} during compilation —
 * fail-closed: the plugin is not loaded and the row is skipped (counted as
 * {@code skipped} by the execution stats at request time).</p>
 */
public class SandboxGuardCustomizer extends CompilationCustomizer {

    public SandboxGuardCustomizer() {
        // CANONICALIZATION (not the stock customizer's CONVERSION): class names and
        // typed-parameter receivers are only RESOLVED after semantic analysis — at
        // CONVERSION a `new File(...)` target still reads as the unresolved "File"
        // (dot-less ⇒ script class) and any whitelist check on types is void.
        super(CompilePhase.CANONICALIZATION);
    }

    @Override
    public void call(SourceUnit source, org.codehaus.groovy.classgen.GeneratorContext context,
                     ClassNode classNode) {
        GuardVisitor visitor = new GuardVisitor(source);

        // the module statement block (plain statement scripts) + every declared class:
        // methods AND constructors AND field initializers — the stock customizer only
        // covers methods, which is exactly the hole malicious scripts exploit.
        source.getAST().getStatementBlock().visit(visitor);
        for (ClassNode cn : source.getAST().getClasses()) {
            for (MethodNode method : cn.getMethods()) {
                if (method.getCode() != null) {
                    method.getCode().visit(visitor);
                }
            }
            for (ConstructorNode ctor : cn.getDeclaredConstructors()) {
                if (ctor.getCode() != null) {
                    ctor.getCode().visit(visitor);
                }
            }
            for (FieldNode field : cn.getFields()) {
                Expression initial = field.getInitialValueExpression();
                if (initial != null) {
                    initial.visit(visitor);
                }
            }
        }
    }

    private static final class GuardVisitor extends ClassCodeVisitorSupport {

        private final SourceUnit sourceUnit;

        GuardVisitor(SourceUnit sourceUnit) {
            this.sourceUnit = sourceUnit;
        }

        @Override
        protected SourceUnit getSourceUnit() {
            return sourceUnit;
        }

        private void deny(String what, ASTNode node) {
            throw GroovySandbox.sandboxViolation(what + ": " + node.getText());
        }

        @Override
        public void visitMethodCallExpression(MethodCallExpression call) {
            String name = GroovySandbox.constantName(call.getMethod());
            if (name == null) {
                deny("Dynamic method dispatch is not allowed", call);
            }
            if (GroovySandbox.DENIED_METHODS.contains(name)) {
                deny("Method '" + name + "' is not allowed", call);
            }
            String receiver = call.getObjectExpression().getType().getName();
            if ("execute".equals(name) && !GroovySandbox.isExecuteCallAllowed(receiver)) {
                deny("execute() is only allowed on plugin SDK receivers (not '" + receiver + "')", call);
            }
            if (!GroovySandbox.isClassAllowed(receiver)) {
                deny("Method call on non-whitelisted type '" + receiver + "'", call);
            }
            super.visitMethodCallExpression(call);
        }

        @Override
        public void visitStaticMethodCallExpression(StaticMethodCallExpression call) {
            if (GroovySandbox.DENIED_METHODS.contains(call.getMethod())) {
                deny("Method '" + call.getMethod() + "' is not allowed", call);
            }
            String owner = call.getOwnerType().getName();
            if (!GroovySandbox.isClassAllowed(owner)) {
                deny("Static method call on non-whitelisted type '" + owner + "'", call);
            }
            super.visitStaticMethodCallExpression(call);
        }

        @Override
        public void visitConstructorCallExpression(ConstructorCallExpression call) {
            String type = call.getType().getName();
            if (!GroovySandbox.isClassAllowed(type)) {
                deny("Construction of non-whitelisted type '" + type + "'", call);
            }
            super.visitConstructorCallExpression(call);
        }

        @Override
        public void visitPropertyExpression(PropertyExpression expression) {
            String property = GroovySandbox.constantName(expression.getProperty());
            if (property == null) {
                deny("Dynamic property access is not allowed", expression);
            }
            if (GroovySandbox.DENIED_PROPERTIES.contains(property)) {
                deny("Property '" + property + "' is not allowed", expression);
            }
            String receiver = expression.getObjectExpression().getType().getName();
            if (!GroovySandbox.isClassAllowed(receiver)) {
                deny("Property access on non-whitelisted type '" + receiver + "'", expression);
            }
            super.visitPropertyExpression(expression);
        }

        @Override
        public void visitCastExpression(org.codehaus.groovy.ast.expr.CastExpression expression) {
            String type = expression.getType().getName();
            if (!GroovySandbox.isClassAllowed(type)) {
                deny("Cast to non-whitelisted type '" + type + "'", expression);
            }
            super.visitCastExpression(expression);
        }

        @Override
        public void visitArrayExpression(org.codehaus.groovy.ast.expr.ArrayExpression expression) {
            if (expression.getElementType() != null
                    && !GroovySandbox.isClassAllowed(expression.getElementType().getName())) {
                deny("Array of non-whitelisted type '" + expression.getElementType().getName() + "'", expression);
            }
            super.visitArrayExpression(expression);
        }
    }
}
