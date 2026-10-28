package fun.commons.gateway4j.admin.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
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
public class UserService extends ServiceImpl<UserMapper, User> {

    private final UserRoleRelMapper userRoleRelMapper;
    private final BCryptPasswordEncoder passwordEncoder = new BCryptPasswordEncoder();

    public UserService(UserRoleRelMapper userRoleRelMapper) {
        this.userRoleRelMapper = userRoleRelMapper;
    }

    public Page<User> listUsers(int page, int pageSize, String status, String keyword) {
        LambdaQueryWrapper<User> wrapper = new LambdaQueryWrapper<>();
        if (status != null) {
            wrapper.eq(User::getStatus, status);
        }
        if (keyword != null && !keyword.isEmpty()) {
            wrapper.and(w -> w.like(User::getUsername, keyword).or().like(User::getRealName, keyword));
        }
        wrapper.orderByDesc(User::getCreatedAt);
        return page(new Page<>(page, pageSize), wrapper);
    }

    @Transactional
    public User createUser(User user, List<String> roleCodes) {
        validateUsernameUnique(user.getUsername(), null);
        user.setPassword(passwordEncoder.encode(user.getPassword()));
        save(user);
        if (roleCodes != null) {
            for (String roleCode : roleCodes) {
                userRoleRelMapper.insert(UserRoleRel.builder()
                        .userId(user.getId())
                        .roleCode(roleCode)
                        .build());
            }
        }
        return user;
    }

    @Transactional
    public void updateUser(Long userId, User user, List<String> roleCodes) {
        User existing = getById(userId);
        if (existing == null) {
            throw new BusinessException(ErrorCode.ROUTE_NOT_FOUND, "用户未找到");
        }
        if (user.getUsername() != null && !user.getUsername().equals(existing.getUsername())) {
            validateUsernameUnique(user.getUsername(), userId);
        }
        if (user.getPassword() != null && !user.getPassword().isEmpty()) {
            user.setPassword(passwordEncoder.encode(user.getPassword()));
        } else {
            user.setPassword(null);
        }
        user.setId(userId);
        updateById(user);
        if (roleCodes != null) {
            userRoleRelMapper.delete(new LambdaQueryWrapper<UserRoleRel>()
                    .eq(UserRoleRel::getUserId, userId));
            for (String roleCode : roleCodes) {
                userRoleRelMapper.insert(UserRoleRel.builder()
                        .userId(userId)
                        .roleCode(roleCode)
                        .build());
            }
        }
    }

    @Transactional
    public void deleteUser(Long userId) {
        User existing = getById(userId);
        if (existing == null) {
            throw new BusinessException(ErrorCode.ROUTE_NOT_FOUND, "用户未找到");
        }
        getBaseMapper().deleteById(userId);
        userRoleRelMapper.delete(new LambdaQueryWrapper<UserRoleRel>()
                .eq(UserRoleRel::getUserId, userId));
    }

    @Transactional
    public void resetPassword(Long userId, String newPassword) {
        User user = getById(userId);
        if (user == null) {
            throw new BusinessException(ErrorCode.ROUTE_NOT_FOUND, "用户未找到");
        }
        user.setPassword(passwordEncoder.encode(newPassword));
        updateById(user);
    }

    private void validateUsernameUnique(String username, Long excludeId) {
        LambdaQueryWrapper<User> wrapper = new LambdaQueryWrapper<User>()
                .eq(User::getUsername, username);
        if (excludeId != null) {
            wrapper.ne(User::getId, excludeId);
        }
        if (count(wrapper) > 0) {
            throw new BusinessException(ErrorCode.CONFIG_SYNC_FAILED, "用户名已存在: " + username);
        }
    }
}
