package fun.commons.gateway4j.admin.controller;

import fun.commons.gateway4j.admin.service.RbacService;
import fun.commons.gateway4j.common.model.Role;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class RbacControllerTest {

    @Mock private RbacService rbacService;
    @InjectMocks private RbacController controller;

    @Test
    void listRoles() {
        when(rbacService.listRoles()).thenReturn(List.of(
                Role.builder().id(1L).roleCode("ROLE_ADMIN").build()));
        List<Role> result = controller.listRoles();
        assertEquals(1, result.size());
        assertEquals("ROLE_ADMIN", result.get(0).getRoleCode());
    }
}
