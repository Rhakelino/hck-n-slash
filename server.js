/**
 * server.js — Multiplayer Co-op Game Server (Node.js + Socket.io)
 *
 * Mengelola:
 *   - Room / Players connection & synchronization
 *   - Enemy wave spawning sinkron antar player
 *   - Broadcast serangan (Combo Slash, Spin, Dash, Badang Ulti)
 *   - Health & Damage synchronization
 */

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: '*' }
});

const PORT = process.env.PORT || 3000;

// Serve client static files
app.use(express.static(path.join(__dirname)));

const WORLD_W = 2000;
const WORLD_H = 2000;

// Game State
const players = {};
let enemies = [];
let nextEnemyId = 1;
let currentWave = 1;
let waveTimer = 3.0;
let waveActive = true;
let enemiesToSpawn = 5;
let spawnTimer = 0;
let totalKills = 0;

const PLAYER_COLORS = [
    { name: 'Blue Knight',   body: '#3498db', glow: '#2980b9' },
    { name: 'Red Berserker', body: '#e74c3c', glow: '#c0392b' },
    { name: 'Green Ranger',  body: '#2ecc71', glow: '#27ae60' },
    { name: 'Purple Mage',   body: '#9b59b6', glow: '#8e44ad' },
    { name: 'Gold Paladin',  body: '#f39c12', glow: '#d35400' }
];
let colorIndex = 0;

io.on('connection', (socket) => {
    console.log(`[Player Connected] ID: ${socket.id}`);

    // Assign color & starting position
    const colorTheme = PLAYER_COLORS[colorIndex % PLAYER_COLORS.length];
    colorIndex++;

    players[socket.id] = {
        id: socket.id,
        x: WORLD_W / 2 + (Math.random() - 0.5) * 100,
        y: WORLD_H / 2 + (Math.random() - 0.5) * 100,
        facingX: 1,
        facingY: 0,
        facingAngle: 0,
        hp: 100,
        maxHp: 100,
        state: 'idle',
        color: colorTheme.body,
        glow: colorTheme.glow,
        name: `Hero #${socket.id.substring(0, 4).toUpperCase()}`
    };

    // Kirim state awal ke player baru
    socket.emit('game:init', {
        myId: socket.id,
        worldW: WORLD_W,
        worldH: WORLD_H,
        players: players,
        enemies: enemies,
        wave: currentWave,
        totalKills: totalKills
    });

    // Beritahu player lain
    socket.broadcast.emit('player:joined', players[socket.id]);

    // Update gerakan/posisi dari client
    socket.on('player:move', (data) => {
        if (!players[socket.id]) return;
        const p = players[socket.id];
        p.x = data.x;
        p.y = data.y;
        p.facingX = data.facingX;
        p.facingY = data.facingY;
        p.facingAngle = data.facingAngle;
        p.state = data.state;
    });

    // Broadcast aksi skill / attack
    socket.on('player:action', (data) => {
        socket.broadcast.emit('player:action', {
            id: socket.id,
            action: data.action,
            params: data.params
        });
    });

    // Update damage yang mengenai musuh
    socket.on('enemy:hit', (data) => {
        const enemy = enemies.find(e => e.id === data.enemyId);
        if (enemy && !enemy.dead) {
            enemy.hp -= data.damage;
            enemy.knockX = (data.knockX || 0) * 200;
            enemy.knockY = (data.knockY || 0) * 200;

            if (enemy.hp <= 0) {
                enemy.hp = 0;
                enemy.dead = true;
                totalKills++;
            }

            io.emit('enemy:updated', {
                id: enemy.id,
                hp: enemy.hp,
                dead: enemy.dead,
                knockX: enemy.knockX,
                knockY: enemy.knockY,
                damage: data.damage,
                totalKills: totalKills
            });
        }
    });

    // Player terkena damage
    socket.on('player:damage', (data) => {
        if (!players[socket.id]) return;
        players[socket.id].hp = Math.max(0, players[socket.id].hp - data.amount);
        io.emit('player:hp_changed', {
            id: socket.id,
            hp: players[socket.id].hp
        });
    });

    socket.on('disconnect', () => {
        console.log(`[Player Disconnected] ID: ${socket.id}`);
        delete players[socket.id];
        io.emit('player:left', socket.id);
    });
});

// ═══════════════════════════════════════════
//  SERVER GAME LOOP (WAVE & ENEMY AI)
// ═══════════════════════════════════════════
function spawnServerEnemy() {
    const pKeys = Object.keys(players);
    if (pKeys.length === 0) return;

    // Target random player untuk posisi spawn di sekitar arena
    const targetPlayer = players[pKeys[Math.floor(Math.random() * pKeys.length)]];
    const side = Math.floor(Math.random() * 4);
    const margin = 60;
    let x = margin, y = margin;

    if (side === 0) { x = margin + Math.random() * (WORLD_W - margin * 2); y = margin; }
    else if (side === 1) { x = margin + Math.random() * (WORLD_W - margin * 2); y = WORLD_H - margin; }
    else if (side === 2) { x = margin; y = margin + Math.random() * (WORLD_H - margin * 2); }
    else { x = WORLD_W - margin; y = margin + Math.random() * (WORLD_H - margin * 2); }

    const type = Math.random() < 0.5 ? 'skeleton' : 'slime';
    const hp = type === 'skeleton' ? 45 + currentWave * 5 : 28 + currentWave * 3;

    enemies.push({
        id: nextEnemyId++,
        type: type,
        x: x,
        y: y,
        hp: hp,
        maxHp: hp,
        speed: type === 'skeleton' ? 100 : 75,
        damage: type === 'skeleton' ? 10 : 6,
        dead: false
    });
}

const TICK_RATE = 30; // 30 updates per detik
let lastServerTick = Date.now();

setInterval(() => {
    const now = Date.now();
    const dt = (now - lastServerTick) / 1000;
    lastServerTick = now;

    const pKeys = Object.keys(players);
    if (pKeys.length > 0) {
        // Wave Spawner logic
        if (!waveActive) {
            waveTimer -= dt;
            if (waveTimer <= 0) {
                currentWave++;
                waveActive = true;
                enemiesToSpawn = 4 + currentWave * 2;
                io.emit('wave:start', { wave: currentWave });
            }
        } else {
            if (enemiesToSpawn > 0) {
                spawnTimer -= dt;
                if (spawnTimer <= 0) {
                    spawnServerEnemy();
                    enemiesToSpawn--;
                    spawnTimer = 0.6;
                }
            }

            const aliveEnemies = enemies.filter(e => !e.dead);
            if (aliveEnemies.length === 0 && enemiesToSpawn === 0) {
                waveActive = false;
                waveTimer = 3.5;
                io.emit('wave:cleared', { wave: currentWave, nextWaveIn: 3.5 });
            }
        }

        // Enemy AI chase closest player
        for (const e of enemies) {
            if (e.dead) continue;

            // Decay knockback
            if (e.knockX || e.knockY) {
                e.x += (e.knockX || 0) * dt;
                e.y += (e.knockY || 0) * dt;
                e.knockX *= 0.1;
                e.knockY *= 0.1;
                continue;
            }

            // Cari player terdekat
            let closest = null;
            let minDist = Infinity;
            for (const pid of pKeys) {
                const p = players[pid];
                const d = Math.hypot(p.x - e.x, p.y - e.y);
                if (d < minDist) {
                    minDist = d;
                    closest = p;
                }
            }

            if (closest && minDist > 35) {
                const nx = (closest.x - e.x) / minDist;
                const ny = (closest.y - e.y) / minDist;
                e.x += nx * e.speed * dt;
                e.y += ny * e.speed * dt;
            }
        }

        // Bersihkan musuh yang sudah mati setelah beberapa detik
        enemies = enemies.filter(e => !e.dead || (e.removeAfter && Date.now() < e.removeAfter));
    }

    // Broadcast snapshot ke semua client
    io.emit('game:state', {
        players: players,
        enemies: enemies
    });
}, 1000 / TICK_RATE);

server.listen(PORT, () => {
    console.log(`\n=================================================`);
    console.log(`🎮 Game Server Multiplayer aktif di port ${PORT}`);
    console.log(`👉 Akses Lokal: http://localhost:${PORT}`);
    console.log(`=================================================\n`);
});
