class FuSecurityWatermark {
    constructor(options = {}) {
        var org = options.org || '企业';
        var text = org + '内部系统';
        var subtext = "仅限员工授权使用 非法必究";

        try {
            const token = this.getCookie('fu-gw-token');
            if (token) {
                const payload = this.parseJwtPayload(token);
                if (payload && payload.nick)  {
                    var name = payload.nick;
                    if (name.length  >= 2) {
                        name = name[0] + '*' + name.slice(2);  // 保留第1字，第2字替换为*
                    }
                    var mobile = payload.mobile;
                    if (mobile.length  >= 11) {
                        mobile = mobile[0] + mobile[1]  + mobile[2]  + '****' + mobile.slice(7);
                    }
                    text = org + '内部数据 严禁外泄';
                    const startDate = new Date('2000-01-01'); // 起始日期
                    const endDate = new Date(); // 当前日期（2025-04-19）
                    const timeDiff = endDate - startDate; // 毫秒差值
                    const daysDiff = Math.floor(timeDiff  / (1000 * 60 * 60 * 24)); // 转换为天数
                    //new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
                    subtext = name + ' ' + mobile + ' ' + daysDiff
                    subtext = subtext + ' ' + this.crc16(subtext).toUpperCase();
                } else {
                    console.log("JWT 中未找到nick字段");
                }
            } else {
                console.log("未找到JWT Cookie");
            }
        }catch (e) {
            console.log("获取token数据失败：", e);
        }

        this.config  = {
            text: text,
            subtext: subtext,
            width: 400,    // 单个水印单元宽度
            height: 200,   // 单个水印单元高度
            fontSize: 32,
            color: 'rgba(128, 128, 128, 0.2)',
            rotate: -20,
            zIndex: 9999,
            mixBlendMode: 'difference',
            ...options
        };

        // 初始化后启动父级检查
        this.init();

    }

    // 新增父级水印检查逻辑
    init() {
        // 仅iframe需要检查
        if (window.self === window.top) {

            window.addEventListener('message', (e) => {
                if (e.data?.type === 'watermarkCheck') {
                    const hasMark = !!document.getElementById('fu-security-watermark');
                    console.log("parent hasMark = ", hasMark)
                    e.source.postMessage({
                        type: 'hasWatermark',
                        value: hasMark
                    }, '*');
                }
            });

            this.initWatermark();
            this.observeDOM();

        }else{

            try {
                // 如果是iframe且父级有水印
                if (window.self  !== window.top  &&
                    parent.document.getElementById('fu-security-watermark'))  {
                    return;
                }
            } catch (e) {
            }

            // 设置定时检查
            this.parentCheckTimer = setInterval(() => {
                // 发送验证请求给父页面
                window.parent.postMessage({ type: 'watermarkCheck' }, '*');
            }, 2000);

            // 监听父级响应
            window.addEventListener('message', (e) => {
                if (e.data?.type === 'hasWatermark') {
                    this.destroy();
                }
            });

            setTimeout(() => {
                this.initWatermark();
                this.observeDOM();
            }, 1000);

        }
    }

    // 新增销毁方法
    destroy() {
        clearInterval(this.parentCheckTimer);
        if (this.watermark) {
            this.watermark.remove();
            this.watermark = null;
        }
    }

    // 初始化水印
    initWatermark() {
        this.watermark  = document.createElement('div');
        this.watermark.id  = 'fu-security-watermark';

        Object.assign(this.watermark.style,  {
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            pointerEvents: 'none',
            zIndex: this.config.zIndex,
            backgroundImage: `url(${this.createPattern()})`,
            backgroundRepeat: 'repeat',
            mixBlendMode: this.config.mixBlendMode
        });

        document.body.appendChild(this.watermark);

        // 窗口变化时重置
        window.addEventListener('resize',  () => {
            this.watermark.style.backgroundImage  = `url(${this.createPattern()})`;
        });
    }

    // 创建平铺图案
    createPattern() {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        canvas.width  = this.config.width;
        canvas.height  = this.config.height;

        ctx.font  = `${this.config.fontSize}px  sans-serif`;
        ctx.fillStyle  = this.config.color;
        ctx.textAlign  = 'center';
        ctx.textBaseline  = 'middle';

        // 坐标变换
        ctx.translate(canvas.width/2,  canvas.height/2);
        ctx.rotate(this.config.rotate  * Math.PI / 180);
        ctx.translate(-canvas.width/2,  -canvas.height/2);

        ctx.fillText(this.config.text,  canvas.width/2,  canvas.height/2 - this.config.fontSize/1.8 );

        ctx.font  = `${this.config.fontSize * 0.8 }px  sans-serif`;
        ctx.fillText(this.config.subtext,  canvas.width/2,  canvas.height/2 + this.config.fontSize/1.8);

        return canvas.toDataURL();

    }

    // DOM防篡改保护
    observeDOM() {
        const observer = new MutationObserver(mutations => {
            mutations.forEach(mutation  => {
                const nodes = Array.from(mutation.removedNodes);
                if (nodes.includes(this.watermark))  {
                    this.init();
                }
            });
        });

        observer.observe(document.body,  {
            childList: true,
            subtree: true
        });

      }

        // 1. 获取Cookie中的JWT
    getCookie(name) {
        const value = `; ${document.cookie}`;
        const parts = value.split(`; ${name}=`);
        if (parts.length  === 2) return parts.pop().split(';').shift();
    }

    // 2. 解析JWT的Payload部分
     parseJwtPayload(jwt) {
        try {
            const base64Url = jwt.split('.')[1];  // 获取Payload部分
            const base64 = base64Url.replace(/-/g,  '+').replace(/_/g, '/');
            const decodedPayload = decodeURIComponent(
                atob(base64)
                    .split('')
                    .map(c => `%${('00' + c.charCodeAt(0).toString(16)).slice(-2)}`)
                    .join('')
            );
            return JSON.parse(decodedPayload);
        } catch (e) {
            console.error("JWT 解析失败:", e);
            return null;
        }
    }

    crc16(str) {
        let crc = 0xFFFF;
        for (let i = 0; i < str.length;  i++) {
            crc ^= str.charCodeAt(i);
            for (let j = 0; j < 8; j++) {
                crc = (crc & 1) ? (crc >>> 1) ^ 0xA001 : crc >>> 1;
            }
        }
        return (crc & 0xFF).toString(16).padStart(2, '0'); // 取低字节转16进制
    }

}



