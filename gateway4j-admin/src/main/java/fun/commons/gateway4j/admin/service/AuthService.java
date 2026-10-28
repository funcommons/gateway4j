package fun.commons.gateway4j.admin.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import fun.commons.gateway4j.admin.mapper.UserMapper;
import fun.commons.gateway4j.admin.mapper.UserRoleRelMapper;
import fun.commons.gateway4j.common.exception.BusinessException;
import fun.commons.gateway4j.common.constant.ErrorCode;
import fun.commons.gateway4j.common.model.User;
import fun.commons.gateway4j.common.model.UserRoleRel;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
public class AuthService extends ServiceImpl<UserMapper, User> {

    private final UserRoleRelMapper userRoleRelMapper;
    private final BCryptPasswordEncoder passwordEncoder = new BCryptPasswordEncoder();

    public AuthService(UserRoleRelMapper userRoleRelMapper) {
        this.userRoleRelMapper = userRoleRelMapper;
    }

    public User authenticate(String username, String password) {
        User user = getBaseMapper().selectOne(new LambdaQueryWrapper<User>()
                .eq(User::getUsername, username)
                .eq(User::getStatus, "ENABLED"));
        if (user == null || !passwordEncoder.matches(password, user.getPassword())) {
            throw new BusinessException(ErrorCode.CONFIG_SYNC_FAILED, "用户名或密码错误");
        }
        return user;
    }

    public List<String> getUserRoleCodes(Long userId) {
        List<UserRoleRel> rels = userRoleRelMapper.selectList(
                new LambdaQueryWrapper<UserRoleRel>().eq(UserRoleRel::getUserId, userId));
        return rels.stream().map(UserRoleRel::getRoleCode).toList();
    }
}
