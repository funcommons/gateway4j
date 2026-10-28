package fun.commons.gateway4j.admin.controller;

import fun.commons.framework4j.accesstoken.annotation.RequiresToken;
import fun.commons.gateway4j.admin.service.DictService;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/v1/dict")
@RequiresToken("BEARER")
public class DictController {

    private final DictService dictService;

    public DictController(DictService dictService) {
        this.dictService = dictService;
    }

    @GetMapping("/{dict_code}")
    public List<Map<String, String>> getDict(@PathVariable("dict_code") String dictCode) {
        return dictService.getDict(dictCode);
    }
}
