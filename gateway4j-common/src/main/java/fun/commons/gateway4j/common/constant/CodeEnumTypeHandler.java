package fun.commons.gateway4j.common.constant;

import org.apache.ibatis.type.BaseTypeHandler;
import org.apache.ibatis.type.JdbcType;
import org.apache.ibatis.type.MappedJdbcTypes;
import org.apache.ibatis.type.MappedTypes;

import java.sql.CallableStatement;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.HashMap;
import java.util.Map;

@MappedTypes(CodeEnum.class)
@MappedJdbcTypes(JdbcType.VARCHAR)
public class CodeEnumTypeHandler<E extends CodeEnum> extends BaseTypeHandler<E> {

    private final Class<E> enumClass;
    private final Map<String, E> codeToEnum;

    public CodeEnumTypeHandler(Class<E> enumClass) {
        this.enumClass = enumClass;
        this.codeToEnum = new HashMap<>();
        for (E e : enumClass.getEnumConstants()) {
            codeToEnum.put(e.code(), e);
        }
    }

    @Override
    public void setNonNullParameter(PreparedStatement ps, int i, E parameter, JdbcType jdbcType)
            throws SQLException {
        ps.setString(i, parameter.code());
    }

    E fromCodeString(String code) {
        if (code == null) {
            return null;
        }
        E result = codeToEnum.get(code);
        if (result == null) {
            throw new IllegalArgumentException(
                    "Unknown code '" + code + "' for enum " + enumClass.getSimpleName());
        }
        return result;
    }

    @Override
    public E getNullableResult(ResultSet rs, String columnName) throws SQLException {
        return fromCodeString(rs.getString(columnName));
    }

    @Override
    public E getNullableResult(ResultSet rs, int columnIndex) throws SQLException {
        return fromCodeString(rs.getString(columnIndex));
    }

    @Override
    public E getNullableResult(CallableStatement cs, int columnIndex) throws SQLException {
        return fromCodeString(cs.getString(columnIndex));
    }
}
