/**
 * engine.js — Core Engine
 *
 * Berisi:
 *   • Game.Input   — Keyboard + Mouse state tracker (just-pressed support)
 *   • Game.Camera  — Smooth lerp camera + screen shake
 *   • Game.Particle / Game.spawnParticles — Sistem partikel ringan
 *   • Game.Engine  — Game loop (update → render @ 60 fps)
 *   • Konstanta dunia (WORLD_W, WORLD_H)
 */

window.Game = window.Game || {};

// ═══════════════════════════════════════════
//  WORLD CONSTANTS
// ═══════════════════════════════════════════
Game.WORLD_W = 2000;
Game.WORLD_H = 2000;

// ═══════════════════════════════════════════
//  INPUT MANAGER
// ═══════════════════════════════════════════
Game.Input = {

    keys: {},           // true jika sedang ditekan
    _prevKeys: {},      // state frame sebelumnya
    justPressed: {},    // true HANYA di frame pertama key ditekan

    mouse: {
        x: 0, y: 0,            // posisi di layar (canvas)
        worldX: 0, worldY: 0,  // posisi di dunia
        left: false,
        right: false,
    },
    _prevMouseLeft: false,

    /** Inisialisasi semua event listener */
    init(canvas) {
        // Keyboard
        window.addEventListener('keydown', (e) => {
            this.keys[e.code] = true;
            // Cegah scroll untuk tombol game
            if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
                e.preventDefault();
            }
        });
        window.addEventListener('keyup', (e) => {
            this.keys[e.code] = false;
        });

        // Mouse position
        canvas.addEventListener('mousemove', (e) => {
            const rect = canvas.getBoundingClientRect();
            this.mouse.x = e.clientX - rect.left;
            this.mouse.y = e.clientY - rect.top;
        });

        // Mouse buttons
        canvas.addEventListener('mousedown', (e) => {
            if (e.button === 0) this.mouse.left  = true;
            if (e.button === 2) this.mouse.right = true;
        });
        canvas.addEventListener('mouseup', (e) => {
            if (e.button === 0) this.mouse.left  = false;
            if (e.button === 2) this.mouse.right = false;
        });

        // Disable context menu
        canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    },

    /** Panggil di AWAL frame, sebelum update logika */
    updateBegin() {
        for (const key in this.keys) {
            this.justPressed[key] = this.keys[key] && !this._prevKeys[key];
        }
    },

    /** Panggil di AKHIR frame, setelah semua update selesai */
    updateEnd() {
        this._prevKeys      = { ...this.keys };
        this._prevMouseLeft = this.mouse.left;
    },

    isDown(code)        { return !!this.keys[code]; },
    isJustPressed(code) { return !!this.justPressed[code]; },

    /** True hanya di frame pertama tombol mouse kiri ditekan */
    mouseJustPressed() {
        return this.mouse.left && !this._prevMouseLeft;
    },
};

// ═══════════════════════════════════════════
//  CAMERA  (smooth lerp + shake)
// ═══════════════════════════════════════════
Game.Camera = class Camera {

    constructor(viewW, viewH) {
        this.x = 0;
        this.y = 0;
        this.width  = viewW;
        this.height = viewH;

        this.targetX = 0;
        this.targetY = 0;
        this.lerpSpeed = 5;        // lebih tinggi = lebih cepat mengejar

        // Shake
        this.shakeTimer     = 0;
        this.shakeIntensity = 0;
    }

    /** Atur target ikut posisi entitas */
    follow(tx, ty) {
        this.targetX = tx - this.width  / 2;
        this.targetY = ty - this.height / 2;
    }

    update(dt) {
        // Lerp
        this.x += (this.targetX - this.x) * this.lerpSpeed * dt;
        this.y += (this.targetY - this.y) * this.lerpSpeed * dt;

        // Clamp ke batas dunia
        this.x = Math.max(0, Math.min(Game.WORLD_W - this.width,  this.x));
        this.y = Math.max(0, Math.min(Game.WORLD_H - this.height, this.y));

        // Shake decay
        if (this.shakeTimer > 0) this.shakeTimer -= dt;
    }

    applyShake(duration, intensity) {
        this.shakeTimer     = duration;
        this.shakeIntensity = intensity;
    }

    /** @returns {{x:number, y:number}} */
    _shakeOffset() {
        if (this.shakeTimer > 0) {
            return {
                x: (Math.random() - 0.5) * 2 * this.shakeIntensity,
                y: (Math.random() - 0.5) * 2 * this.shakeIntensity,
            };
        }
        return { x: 0, y: 0 };
    }

    /** World → Screen */
    worldToScreen(wx, wy) {
        const s = this._shakeOffset();
        return { x: wx - this.x + s.x, y: wy - this.y + s.y };
    }

    /** Screen → World */
    screenToWorld(sx, sy) {
        return { x: sx + this.x, y: sy + this.y };
    }

    resize(w, h) {
        this.width  = w;
        this.height = h;
    }
};

// ═══════════════════════════════════════════
//  PARTICLE SYSTEM
// ═══════════════════════════════════════════
Game.Particle = class Particle {
    constructor(x, y, cfg) {
        this.x = x;
        this.y = y;
        this.vx      = cfg.vx || 0;
        this.vy      = cfg.vy || 0;
        this.life    = cfg.life || 0.5;
        this.maxLife = this.life;
        this.color   = cfg.color || '#fff';
        this.size    = cfg.size || 4;
        this.decay   = cfg.decay || 0;
        this.gravity = cfg.gravity || 0;
        this.dead    = false;
    }

    update(dt) {
        this.x  += this.vx * dt;
        this.y  += this.vy * dt;
        this.vy += this.gravity * dt;
        this.life -= dt;
        this.size -= this.decay * dt;
        if (this.life <= 0 || this.size <= 0) this.dead = true;
    }

    draw(ctx, camera) {
        const s     = camera.worldToScreen(this.x, this.y);
        const alpha = Math.max(0, this.life / this.maxLife);
        ctx.globalAlpha = alpha;
        ctx.fillStyle   = this.color;
        ctx.fillRect(s.x - this.size / 2, s.y - this.size / 2, this.size, this.size);
        ctx.globalAlpha = 1;
    }
};

Game.particles = [];

/**
 * Spawn sekelompok partikel
 * @param {number} x world X
 * @param {number} y world Y
 * @param {number} count jumlah partikel
 * @param {Object} cfg { speed, color, size, life, decay, gravity, vx, vy }
 */
Game.spawnParticles = function (x, y, count, cfg) {
    for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = (cfg.speed || 100) * (0.5 + Math.random() * 0.5);
        Game.particles.push(new Game.Particle(x, y, {
            vx:      Math.cos(angle) * speed + (cfg.vx || 0),
            vy:      Math.sin(angle) * speed + (cfg.vy || 0),
            life:    (cfg.life || 0.5) * (0.7 + Math.random() * 0.3),
            color:   cfg.color || '#fff',
            size:    (cfg.size || 4) * (0.5 + Math.random() * 0.5),
            decay:   cfg.decay || 3,
            gravity: cfg.gravity || 0,
        }));
    }
};

// ═══════════════════════════════════════════
//  DAMAGE NUMBER POPUPS
// ═══════════════════════════════════════════
Game.DamageNumber = class DamageNumber {
    constructor(x, y, text, color) {
        this.x     = x + (Math.random() - 0.5) * 20;
        this.y     = y;
        this.text  = text;
        this.color = color || '#fff';
        this.life  = 0.8;
        this.maxLife = 0.8;
        this.dead  = false;
    }

    update(dt) {
        this.y    -= 60 * dt;
        this.life -= dt;
        if (this.life <= 0) this.dead = true;
    }

    draw(ctx, camera) {
        const s     = camera.worldToScreen(this.x, this.y);
        const alpha = Math.max(0, this.life / this.maxLife);
        const scale = 0.8 + (1 - alpha) * 0.4;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle   = this.color;
        ctx.font        = `bold ${Math.round(16 * scale)}px "Segoe UI", Arial`;
        ctx.textAlign   = 'center';
        ctx.fillText(this.text, s.x, s.y);
        ctx.restore();
    }
};

Game.damageNumbers = [];

Game.spawnDamageNumber = function (x, y, amount, color) {
    Game.damageNumbers.push(new Game.DamageNumber(x, y, String(amount), color));
};

// ═══════════════════════════════════════════
//  GAME ENGINE  (loop, init, resize)
// ═══════════════════════════════════════════
Game.Engine = {
    /** @type {HTMLCanvasElement} */
    canvas: null,
    /** @type {CanvasRenderingContext2D} */
    ctx: null,
    /** @type {Game.Camera} */
    camera: null,

    lastTime: 0,
    running: false,

    init() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx    = this.canvas.getContext('2d');
        this.resize();
        window.addEventListener('resize', () => this.resize());

        Game.Input.init(this.canvas);
        this.camera = new Game.Camera(this.canvas.width, this.canvas.height);
    },

    resize() {
        this.canvas.width  = window.innerWidth;
        this.canvas.height = window.innerHeight;
        if (this.camera) this.camera.resize(this.canvas.width, this.canvas.height);
    },

    start() {
        this.running  = true;
        this.lastTime = performance.now();
        requestAnimationFrame((t) => this._loop(t));
    },

    stop() {
        this.running = false;
    },

    /** @private */
    _loop(timestamp) {
        if (!this.running) return;

        const dt = Math.min((timestamp - this.lastTime) / 1000, 0.05); // cap 50 ms
        this.lastTime = timestamp;

        // --- Input begin ---
        Game.Input.updateBegin();

        // Update mouse world pos
        const wm = this.camera.screenToWorld(Game.Input.mouse.x, Game.Input.mouse.y);
        Game.Input.mouse.worldX = wm.x;
        Game.Input.mouse.worldY = wm.y;

        // --- Update ---
        if (Game.update) Game.update(dt);

        // Particles
        Game.particles.forEach(p => p.update(dt));
        Game.particles = Game.particles.filter(p => !p.dead);

        // Damage numbers
        Game.damageNumbers.forEach(d => d.update(dt));
        Game.damageNumbers = Game.damageNumbers.filter(d => !d.dead);

        // Camera
        this.camera.update(dt);

        // --- Render ---
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        if (Game.render) Game.render(this.ctx, this.camera);

        // Particles on top
        Game.particles.forEach(p => p.draw(this.ctx, this.camera));
        Game.damageNumbers.forEach(d => d.draw(this.ctx, this.camera));

        // --- Input end ---
        Game.Input.updateEnd();

        requestAnimationFrame((t) => this._loop(t));
    },
};
