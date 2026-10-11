/**
 * main.js — Inisialisasi & Asset Loader
 *
 * Berisi:
 *   • Game.AssetLoader — Memuat gambar (sprite sheet) dengan progress
 *   • Game.init()      — Inisialisasi engine, player, spawner
 *   • Game.restart()   — Reset game
 *   • Game.update()    — Main update loop
 *   • Game.render()    — Main render loop (floor, walls, entities, minimap, HUD)
 */

window.Game = window.Game || {};

// ═══════════════════════════════════════════
//  ASSET LOADER
// ═══════════════════════════════════════════
Game.AssetLoader = {

    /** @type {Object<string, HTMLImageElement>} */
    assets: {},
    loaded: 0,
    total:  0,

    /**
     * Muat sebuah gambar (sprite sheet / texture).
     * @param {string} name — nama kunci
     * @param {string} src  — path ke file PNG
     * @returns {Promise<HTMLImageElement|null>}
     */
    loadImage(name, src) {
        this.total++;
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                this.assets[name] = img;
                this.loaded++;
                resolve(img);
            };
            img.onerror = () => {
                console.warn(`[AssetLoader] Gagal memuat: "${name}" (${src})`);
                this.loaded++;
                resolve(null);
            };
            img.src = src;
        });
    },

    /**
     * Muat banyak asset sekaligus.
     * @param {Array<{name:string, src:string}>} list
     * @returns {Promise<void>}
     */
    async loadAll(list) {
        await Promise.all(list.map(a => this.loadImage(a.name, a.src)));
    },

    /** @returns {HTMLImageElement|null} */
    get(name) {
        return this.assets[name] || null;
    },

    /** @returns {number} 0..1 */
    getProgress() {
        return this.total === 0 ? 1 : this.loaded / this.total;
    },
};

// ═══════════════════════════════════════════
//  MODULE-LEVEL STATE
// ═══════════════════════════════════════════
/** @type {Game.Player} */
let player;
/** @type {Game.EnemySpawner} */
let spawner;

let introTimer = 4.0; // detik menampilkan teks kontrol di awal

// ═══════════════════════════════════════════
//  FLOOR & WALL RENDERING
// ═══════════════════════════════════════════
function drawFloor(ctx, camera) {
    const ts = 64; // tile size
    const startCol = Math.floor(camera.x / ts);
    const startRow = Math.floor(camera.y / ts);
    const endCol   = Math.ceil((camera.x + camera.width)  / ts);
    const endRow   = Math.ceil((camera.y + camera.height) / ts);

    for (let r = startRow; r <= endRow; r++) {
        for (let c = startCol; c <= endCol; c++) {
            if (c < 0 || r < 0 || c * ts >= Game.WORLD_W || r * ts >= Game.WORLD_H) continue;
            const s    = camera.worldToScreen(c * ts, r * ts);
            const dark = (c + r) % 2 === 0;
            ctx.fillStyle = dark ? '#252535' : '#2e2e42';
            ctx.fillRect(s.x, s.y, ts + 1, ts + 1);
        }
    }

    // Subtle grid lines
    ctx.strokeStyle = 'rgba(255,255,255,0.03)';
    ctx.lineWidth   = 1;
    for (let r = startRow; r <= endRow; r++) {
        const s = camera.worldToScreen(0, r * ts);
        ctx.beginPath();
        ctx.moveTo(0, s.y);
        ctx.lineTo(ctx.canvas.width, s.y);
        ctx.stroke();
    }
    for (let c = startCol; c <= endCol; c++) {
        const s = camera.worldToScreen(c * ts, 0);
        ctx.beginPath();
        ctx.moveTo(s.x, 0);
        ctx.lineTo(s.x, ctx.canvas.height);
        ctx.stroke();
    }
}

function drawWalls(ctx, camera) {
    const wt = 18; // wall thickness

    ctx.fillStyle = '#444455';

    // Top
    let s = camera.worldToScreen(0, 0);
    ctx.fillRect(s.x, s.y, Game.WORLD_W, wt);
    // Bottom
    s = camera.worldToScreen(0, Game.WORLD_H - wt);
    ctx.fillRect(s.x, s.y, Game.WORLD_W, wt);
    // Left
    s = camera.worldToScreen(0, 0);
    ctx.fillRect(s.x, s.y, wt, Game.WORLD_H);
    // Right
    s = camera.worldToScreen(Game.WORLD_W - wt, 0);
    ctx.fillRect(s.x, s.y, wt, Game.WORLD_H);

    // Top edge highlight
    ctx.fillStyle = '#555566';
    s = camera.worldToScreen(0, 0);
    ctx.fillRect(s.x, s.y, Game.WORLD_W, 3);
    s = camera.worldToScreen(0, 0);
    ctx.fillRect(s.x, s.y, 3, Game.WORLD_H);
}

// ═══════════════════════════════════════════
//  MINIMAP
// ═══════════════════════════════════════════
function drawMinimap(ctx) {
    const size   = 130;
    const margin = 14;
    const mx     = ctx.canvas.width  - size - margin;
    const my     = ctx.canvas.height - size - margin;
    const scale  = size / Game.WORLD_W;

    // Background
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(mx, my, size, size);
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth   = 1;
    ctx.strokeRect(mx, my, size, size);

    // Enemies
    for (const e of spawner.enemies) {
        if (e.dead) continue;
        ctx.fillStyle = e.type === 'skeleton' ? '#ccaa88' : '#44cc44';
        ctx.fillRect(mx + e.x * scale - 1, my + e.y * scale - 1, 3, 3);
    }

    // Player
    ctx.fillStyle = '#5599ff';
    ctx.fillRect(mx + player.x * scale - 2, my + player.y * scale - 2, 5, 5);

    // Camera viewport
    const cam = Game.Engine.camera;
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.strokeRect(
        mx + cam.x * scale,
        my + cam.y * scale,
        cam.width * scale,
        cam.height * scale
    );
}

// ═══════════════════════════════════════════
//  UI UPDATE
// ═══════════════════════════════════════════
function updateUI() {
    // HP
    const hpBar  = document.getElementById('hp-bar');
    const hpText = document.getElementById('hp-text');
    if (hpBar)  hpBar.style.width  = (player.hp / player.maxHp * 100) + '%';
    if (hpText) hpText.textContent = `${Math.max(0, Math.ceil(player.hp))} / ${player.maxHp}`;

    // Dash cooldown
    const cdDash = document.querySelector('#cd-dash .cd-fill');
    if (cdDash) {
        const ready = player.dashCooldown <= 0;
        cdDash.style.height = ((1 - Math.max(0, player.dashCooldown / player.dashCooldownMax)) * 100) + '%';
        cdDash.parentElement.style.borderColor = ready ? '#88ccff' : '#555';
    }

    // Spin cooldown
    const cdSpin = document.querySelector('#cd-skill .cd-fill');
    if (cdSpin) {
        const ready = player.spinCooldown <= 0;
        cdSpin.style.height = ((1 - Math.max(0, player.spinCooldown / player.spinCooldownMax)) * 100) + '%';
        cdSpin.parentElement.style.borderColor = ready ? '#ff8800' : '#555';
    }

    // Ulti cooldown (Badang Fist Crack)
    const cdUlti = document.querySelector('#cd-ulti .cd-fill');
    if (cdUlti) {
        const ready = player.ultiCooldown <= 0;
        cdUlti.style.height = ((1 - Math.max(0, player.ultiCooldown / player.ultiCooldownMax)) * 100) + '%';
        cdUlti.parentElement.style.borderColor = ready ? '#ffd700' : '#555';
        cdUlti.parentElement.style.boxShadow = ready ? '0 0 14px rgba(255, 215, 0, 0.65)' : 'none';
    }

    // Kill counter
    const killEl = document.getElementById('kill-number');
    if (killEl) killEl.textContent = spawner.totalKills;
}

// ═══════════════════════════════════════════
//  GAME CALLBACKS
// ═══════════════════════════════════════════
Game.update = function (dt) {
    if (introTimer > 0) introTimer -= dt;

    player.update(dt, spawner.enemies);
    spawner.update(dt, player);
    Game.Engine.camera.follow(player.x, player.y);
    updateUI();

    // Kirim sinkronisasi posisi player lokal ke server
    if (Game.Network) {
        Game.Network.sendLocalPlayerState(player);
    }
};

Game.render = function (ctx, camera) {
    // --- World ---
    drawFloor(ctx, camera);
    drawWalls(ctx, camera);

    // --- Entities (sort by Y for depth) ---
    const entities = [player, ...spawner.enemies.filter(e => !e.removing)];
    entities.sort((a, b) => a.y - b.y);
    for (const e of entities) e.draw(ctx, camera);

    // --- Remote Players (Teman Online) ---
    if (Game.Network) {
        Game.Network.updateAndDrawRemotePlayers(ctx, camera, 0.016);
    }

    // --- Minimap ---
    drawMinimap(ctx);

    // --- Wave HUD overlay ---
    ctx.textAlign = 'center';

    // Wave cleared message
    if (!spawner.waveActive && spawner.waveTimer > 0 && spawner.wave > 0) {
        ctx.fillStyle = 'rgba(255,215,0,0.85)';
        ctx.font      = 'bold 30px "Segoe UI", Arial';
        ctx.fillText(`✦  Wave ${spawner.wave} Cleared!  ✦`, ctx.canvas.width / 2, 80);

        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.font      = '17px "Segoe UI", Arial';
        ctx.fillText(`Next wave in ${Math.ceil(spawner.waveTimer)}…`, ctx.canvas.width / 2, 112);
    }

    // Wave start announcement
    if (spawner.waveActive && spawner.enemiesToSpawn > 0) {
        ctx.fillStyle = 'rgba(255,70,70,0.85)';
        ctx.font      = 'bold 34px "Segoe UI", Arial';
        ctx.fillText(`⚔  Wave ${spawner.wave}  ⚔`, ctx.canvas.width / 2, 80);

        const aliveCount = spawner.enemies.filter(e => !e.dead).length;
        ctx.fillStyle = 'rgba(255,255,255,0.45)';
        ctx.font      = '15px "Segoe UI", Arial';
        ctx.fillText(`Enemies: ${aliveCount} / ${spawner.enemiesPerWave}`, ctx.canvas.width / 2, 108);
    }

    // --- Intro controls help ---
    if (introTimer > 0) {
        const alpha = Math.min(1, introTimer / 1.5); // fade out
        ctx.globalAlpha = alpha;
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        const bh = 140;
        const by = ctx.canvas.height / 2 - bh / 2 + 80;
        ctx.fillRect(0, by, ctx.canvas.width, bh);

        ctx.fillStyle = '#fff';
        ctx.font      = 'bold 22px "Segoe UI", Arial';
        ctx.fillText('⚔  HACK \'N\' SLASH  ⚔', ctx.canvas.width / 2, by + 30);

        ctx.font      = '15px "Segoe UI", Arial';
        ctx.fillStyle = '#ccc';
        const controls = [
            'WASD — Move    |    Left Click — Attack (3-hit combo)',
            'Space — Dash / Dodge    |    E — Spin Attack (AoE)',
            'R — Badang Ultimate (Fist Crack ✦ Beruntun Pukulan Emas)'
        ];
        controls.forEach((line, i) => {
            ctx.fillText(line, ctx.canvas.width / 2, by + 58 + i * 24);
        });

        ctx.globalAlpha = 1;
    }

    ctx.textAlign = 'left'; // reset
};

Game.onEnemyKilled = function () {
    spawner.totalKills++;
};

Game.onPlayerDeath = function () {
    setTimeout(() => {
        const el = document.getElementById('game-over');
        if (el) {
            el.style.display = 'flex';
            document.getElementById('final-wave').textContent  = spawner.wave;
            document.getElementById('final-kills').textContent = spawner.totalKills;
        }
    }, 600);
};

// ═══════════════════════════════════════════
//  INIT & RESTART
// ═══════════════════════════════════════════
Game.init = async function () {
    Game.Engine.init();

    // ---- Generate dynamic sprite sheets / Load PNG assets ----
    if (Game.AssetGenerator) {
        Game.AssetGenerator.generateAll();
    }

    // Untuk file PNG eksternal, bisa menambahkan:
    // await Game.AssetLoader.loadAll([
    //     { name: 'player_sheet',   src: 'assets/player_sheet.png'   },
    //     { name: 'skeleton_sheet', src: 'assets/skeleton_sheet.png' },
    //     { name: 'slime_sheet',    src: 'assets/slime_sheet.png'    },
    // ]);

    // ---- Create game objects ----
    player  = new Game.Player(Game.WORLD_W / 2, Game.WORLD_H / 2);
    spawner = new Game.EnemySpawner();

    Game.player  = player;
    Game.spawner = spawner;

    // ---- Inisialisasi Multiplayer Network ----
    if (Game.Network) {
        Game.Network.init();
    }

    Game.Engine.start();
    console.log('%c⚔ Hack \'n\' Slash Multiplayer started! ⚔', 'color:#4488ff;font-size:16px;font-weight:bold');
};

Game.restart = function () {
    player  = new Game.Player(Game.WORLD_W / 2, Game.WORLD_H / 2);
    spawner = new Game.EnemySpawner();

    Game.player    = player;
    Game.spawner   = spawner;
    Game.particles = [];
    Game.damageNumbers = [];
    introTimer = 0; // no intro on restart

    const el = document.getElementById('game-over');
    if (el) el.style.display = 'none';
};

// ═══════════════════════════════════════════
//  BOOT
// ═══════════════════════════════════════════
window.addEventListener('DOMContentLoaded', () => {
    Game.init();
});
