/**
 * network.js — Multiplayer Network Manager (Socket.io Client)
 *
 * Mengurus:
 *   - Koneksi ke Node.js game server
 *   - Sinkronisasi remote players (teman satu room)
 *   - Mengirim input & aksi local player ke server
 *   - Menerima state dunia dan update enemy
 */

window.Game = window.Game || {};

Game.Network = {
    socket: null,
    connected: false,
    myId: null,
    remotePlayers: {}, // socketId -> data player lain

    init() {
        if (typeof io === 'undefined') {
            console.warn('[Network] Socket.io client script tidak ditemukan. Bermain dalam mode Offline.');
            return;
        }

        try {
            this.socket = io();

            this.socket.on('connect', () => {
                this.connected = true;
                this.myId = this.socket.id;
                console.log('%c🌐 Terhubung ke Server Multiplayer! ID: ' + this.myId, 'color:#2ecc71;font-weight:bold');
            });

            this.socket.on('game:init', (data) => {
                this.myId = data.myId;
                if (data.wave && Game.spawner) Game.spawner.wave = data.wave;

                // Daftarkan pemain lain yang sudah ada di room
                for (const id in data.players) {
                    if (id !== this.myId) {
                        this.remotePlayers[id] = data.players[id];
                    }
                }
            });

            this.socket.on('player:joined', (playerData) => {
                if (playerData.id !== this.myId) {
                    this.remotePlayers[playerData.id] = playerData;
                    Game.spawnDamageNumber(playerData.x, playerData.y - 30, 'Teman Bergabung!', '#2ecc71');
                }
            });

            this.socket.on('player:left', (id) => {
                delete this.remotePlayers[id];
            });

            // Menerima snapshot posisi dari server
            this.socket.on('game:state', (state) => {
                for (const id in state.players) {
                    if (id !== this.myId) {
                        if (!this.remotePlayers[id]) {
                            this.remotePlayers[id] = state.players[id];
                        } else {
                            // Lerp posisi teman agar halus
                            const p = this.remotePlayers[id];
                            const target = state.players[id];
                            p.targetX = target.x;
                            p.targetY = target.y;
                            p.facingX = target.facingX;
                            p.facingY = target.facingY;
                            p.facingAngle = target.facingAngle;
                            p.state = target.state;
                            p.hp = target.hp;
                        }
                    }
                }
            });

            // Menerima aksi visual pemain lain (misal ulti badang / spin / combo)
            this.socket.on('player:action', (data) => {
                const p = this.remotePlayers[data.id];
                if (!p) return;

                if (data.action === 'ulti') {
                    // Tampilkan efek proyektil tinju & shockwave milik teman
                    Game.Engine.camera.applyShake(0.1, 4);
                    Game.spawnParticles(p.x, p.y, 16, {
                        speed: 150, color: '#f1c40f', size: 5, life: 0.35, decay: 8
                    });
                } else if (data.action === 'spin') {
                    Game.spawnParticles(p.x, p.y, 12, {
                        speed: 80, color: '#ff6600', size: 4, life: 0.3, decay: 7
                    });
                } else if (data.action === 'dash') {
                    Game.spawnParticles(p.x, p.y, 8, {
                        speed: 90, color: '#88ccff', size: 5, life: 0.25, decay: 10
                    });
                }
            });

            this.socket.on('wave:start', (data) => {
                if (Game.spawner) {
                    Game.spawner.wave = data.wave;
                    Game.spawner.waveActive = true;
                }
            });

            this.socket.on('disconnect', () => {
                this.connected = false;
                console.log('[Network] Terputus dari Server.');
            });

        } catch (e) {
            console.error('[Network Error]', e);
        }
    },

    /** Kirim posisi dan hadap Player Lokal ke Server */
    sendLocalPlayerState(player) {
        if (!this.connected || !this.socket) return;
        this.socket.emit('player:move', {
            x: player.x,
            y: player.y,
            facingX: player.facingX,
            facingY: player.facingY,
            facingAngle: player.facingAngle,
            state: player.state
        });
    },

    /** Kirim aksi skill */
    sendAction(action, params = {}) {
        if (!this.connected || !this.socket) return;
        this.socket.emit('player:action', { action, params });
    },

    /** Update lerp & render semua teman (Remote Players) */
    updateAndDrawRemotePlayers(ctx, camera, dt) {
        for (const id in this.remotePlayers) {
            const p = this.remotePlayers[id];

            // Smooth Lerp posisi
            if (p.targetX !== undefined && p.targetY !== undefined) {
                p.x += (p.targetX - p.x) * 12 * dt;
                p.y += (p.targetY - p.y) * 12 * dt;
            }

            const s = camera.worldToScreen(p.x, p.y);
            const w = 36, h = 36;

            ctx.save();

            // Shadow
            ctx.fillStyle = 'rgba(0,0,0,0.3)';
            ctx.beginPath();
            ctx.ellipse(s.x, s.y + h / 2 + 3, (w / 2) * 0.8, 5, 0, 0, Math.PI * 2);
            ctx.fill();

            // Karakter teman (dengan warna unik mereka)
            ctx.fillStyle = p.color || '#e74c3c';
            ctx.fillRect(s.x - w / 2, s.y - h / 2, w, h);
            ctx.fillStyle = p.glow || '#c0392b';
            ctx.fillRect(s.x - w / 2 + 4, s.y - h / 2 + 4, w - 8, h - 8);

            // Matanya
            const ex = (p.facingX || 1) * 4;
            const ey = (p.facingY || 0) * 4;
            ctx.fillStyle = '#fff';
            ctx.fillRect(s.x - 6 + ex, s.y - 7 + ey, 4, 4);
            ctx.fillRect(s.x + 2 + ex, s.y - 7 + ey, 4, 4);

            // Label Nama Player di atas kepala
            ctx.fillStyle = '#f1c40f';
            ctx.font = 'bold 11px "Segoe UI", Arial';
            ctx.textAlign = 'center';
            ctx.fillText(p.name || 'Hero', s.x, s.y - h / 2 - 8);

            // HP bar mini
            const hpBarW = 32;
            ctx.fillStyle = '#222';
            ctx.fillRect(s.x - hpBarW / 2, s.y - h / 2 - 6, hpBarW, 3);
            ctx.fillStyle = '#2ecc71';
            ctx.fillRect(s.x - hpBarW / 2, s.y - h / 2 - 6, hpBarW * ((p.hp || 100) / 100), 3);

            ctx.restore();
        }
    }
};
