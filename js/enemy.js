/**
 * enemy.js — Enemy AI & Wave Spawner
 *
 * Berisi:
 *   • Game.Enemy        — Kelas musuh (Skeleton / Slime) dengan AI mengejar + menyerang
 *   • Game.EnemySpawner — Wave system: musuh muncul bergelombang dengan scaling kesulitan
 */

window.Game = window.Game || {};

// ═══════════════════════════════════════════
//  ENEMY
// ═══════════════════════════════════════════
Game.Enemy = class Enemy {

    /**
     * @param {number} x
     * @param {number} y
     * @param {'skeleton'|'slime'} type
     */
    constructor(x, y, type) {
        this.x    = x;
        this.y    = y;
        this.type = type || 'skeleton';

        this.dead      = false;
        this.deathTimer = 0;
        this.removing  = false;

        // --- Tipe-specific stats ---
        if (this.type === 'skeleton') {
            this.width          = 32;
            this.height         = 32;
            this.speed          = 110;
            this.hp             = 45;
            this.maxHp          = 45;
            this.damage         = 12;
            this.attackRange    = 38;
            this.detectionRange = 320;
            this.attackCooldownMax = 0.9;
            this.color      = '#ccccaa';
            this.innerColor = '#aa9977';
        } else {
            // Slime
            this.width          = 28;
            this.height         = 24;
            this.speed          = 75;
            this.hp             = 28;
            this.maxHp          = 28;
            this.damage         = 8;
            this.attackRange    = 32;
            this.detectionRange = 260;
            this.attackCooldownMax = 1.4;
            this.color      = '#44cc44';
            this.innerColor = '#33aa33';
        }

        // AI state
        this.state         = 'idle';   // idle | chase | attack
        this.attackCooldown = 0;

        // Knockback
        this.knockbackX = 0;
        this.knockbackY = 0;

        // Visual
        this.flashTimer = 0;
        this.bobTimer   = Math.random() * Math.PI * 2;
        this.facingX    = -1;

        // Animations
        this.animations = {};
        this.currentAnim = null;
        this.setupAnimations();
    }

    setupAnimations() {
        if (this.type === 'skeleton') {
            const sheet = Game.AssetLoader.get('skeleton_sheet');
            if (sheet) {
                this.animations = {
                    walk: new Game.SpriteAnimation({
                        image: sheet,
                        frameWidth: 48, frameHeight: 48,
                        columns: 4, rows: 1, startRow: 0,
                        frameRate: 8, loop: true
                    }),
                    attack: new Game.SpriteAnimation({
                        image: sheet,
                        frameWidth: 48, frameHeight: 48,
                        columns: 4, rows: 1, startRow: 1,
                        frameRate: 10, loop: false,
                        impactFrame: 2
                    })
                };
                this.currentAnim = this.animations.walk;
            }
        } else if (this.type === 'slime') {
            const sheet = Game.AssetLoader.get('slime_sheet');
            if (sheet) {
                this.animations = {
                    bounce: new Game.SpriteAnimation({
                        image: sheet,
                        frameWidth: 32, frameHeight: 32,
                        columns: 4, rows: 1, startRow: 0,
                        frameRate: 7, loop: true
                    })
                };
                this.currentAnim = this.animations.bounce;
            }
        }
    }

    // ═══════════════════════════════════════
    //  UPDATE
    // ═══════════════════════════════════════
    update(dt, player) {
        if (this.dead) {
            this.deathTimer -= dt;
            if (this.deathTimer <= 0) this.removing = true;
            return;
        }

        this.bobTimer += dt * 5;
        if (this.flashTimer   > 0) this.flashTimer   -= dt;
        if (this.attackCooldown > 0) this.attackCooldown -= dt;

        // --- Knockback ---
        if (Math.abs(this.knockbackX) > 5 || Math.abs(this.knockbackY) > 5) {
            this.x += this.knockbackX * dt;
            this.y += this.knockbackY * dt;
            this.knockbackX *= Math.pow(0.05, dt); // cepat decay
            this.knockbackY *= Math.pow(0.05, dt);
            this._clampToWorld();
            return;
        }
        this.knockbackX = 0;
        this.knockbackY = 0;

        if (player.dead) { this.state = 'idle'; return; }

        // --- AI ---
        const dx   = player.x - this.x;
        const dy   = player.y - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist <= this.attackRange + player.width / 2) {
            // ATTACK
            this.state = 'attack';
            if (this.attackCooldown <= 0) {
                player.takeDamage(this.damage);
                this.attackCooldown = this.attackCooldownMax;
                Game.Engine.camera.applyShake(0.08, 3);
            }
        } else if (dist <= this.detectionRange) {
            // CHASE
            this.state = 'chase';
            const nx = dx / dist;
            const ny = dy / dist;

            // Separation dari musuh lain (simple avoidance)
            let sepX = 0, sepY = 0;
            if (Game.spawner) {
                for (const other of Game.spawner.enemies) {
                    if (other === this || other.dead) continue;
                    const ox = this.x - other.x;
                    const oy = this.y - other.y;
                    const od = Math.sqrt(ox * ox + oy * oy);
                    if (od < 40 && od > 0) {
                        sepX += (ox / od) * 0.5;
                        sepY += (oy / od) * 0.5;
                    }
                }
            }

            this.x += (nx + sepX) * this.speed * dt;
            this.y += (ny + sepY) * this.speed * dt;
        } else {
            // IDLE — sedikit wander
            this.state = 'idle';
            this.x += Math.sin(this.bobTimer * 0.3) * 12 * dt;
            this.y += Math.cos(this.bobTimer * 0.4) * 12 * dt;
        }

        // Facing direction
        if (dx !== 0) {
            this.facingX = dx > 0 ? 1 : -1;
        }

        // Update Animation
        this._updateAnimation(dt);

        this._clampToWorld();
    }

    _updateAnimation(dt) {
        if (!this.animations || Object.keys(this.animations).length === 0) return;

        let targetAnim = this.animations.walk || this.animations.bounce;
        if (this.state === 'attack' && this.animations.attack) {
            targetAnim = this.animations.attack;
        }

        if (this.currentAnim !== targetAnim) {
            this.currentAnim = targetAnim;
            if (this.state === 'attack') this.currentAnim.reset();
        }

        if (this.currentAnim) {
            this.currentAnim.flipX = (this.facingX < 0);
            this.currentAnim.update(dt);
        }
    }

    // ═══════════════════════════════════════
    //  TAKE DAMAGE
    // ═══════════════════════════════════════
    takeDamage(amount, knockDirX, knockDirY) {
        if (this.dead) return;

        this.hp -= amount;
        this.flashTimer = 0.12;

        // Knockback
        this.knockbackX = knockDirX * 350;
        this.knockbackY = knockDirY * 350;

        // Hit particles
        Game.spawnParticles(this.x, this.y, 5, {
            speed: 130, color: '#ffcc00', size: 4, life: 0.2, decay: 10
        });

        if (this.hp <= 0) this._die();
    }

    /** @private */
    _die() {
        this.dead       = true;
        this.deathTimer = 0.5;

        Game.spawnParticles(this.x, this.y, 14, {
            speed:   160,
            color:   this.type === 'skeleton' ? '#ddddbb' : '#55dd55',
            size:    6,
            life:    0.6,
            decay:   5,
            gravity: 220,
        });

        if (Game.onEnemyKilled) Game.onEnemyKilled();
    }

    _clampToWorld() {
        const hw = this.width  / 2;
        const hh = this.height / 2;
        const wm = 20;
        this.x = Math.max(hw + wm, Math.min(Game.WORLD_W - hw - wm, this.x));
        this.y = Math.max(hh + wm, Math.min(Game.WORLD_H - hh - wm, this.y));
    }

    // ═══════════════════════════════════════
    //  DRAW
    // ═══════════════════════════════════════
    draw(ctx, camera) {
        const s  = camera.worldToScreen(this.x, this.y);
        const hw = this.width  / 2;
        const hh = this.height / 2;

        ctx.save();

        // Death fade-out
        if (this.dead) ctx.globalAlpha = Math.max(0, this.deathTimer / 0.5);

        // Damage flash
        if (this.flashTimer > 0 && Math.floor(this.flashTimer * 30) % 2 === 0) {
            ctx.globalAlpha *= 0.4;
        }

        const bob = this.type === 'slime'
            ? Math.sin(this.bobTimer) * 3
            : Math.sin(this.bobTimer) * 1;

        // --- Shadow ---
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath();
        ctx.ellipse(s.x, s.y + hh + 3, hw * 0.7, 4, 0, 0, Math.PI * 2);
        ctx.fill();

        if (this.currentAnim && this.currentAnim.image) {
            const renderSize = this.type === 'skeleton' ? 48 : 32;
            this.currentAnim.draw(ctx, s.x, s.y, renderSize, renderSize, true);
        } else {
            if (this.type === 'slime') {
                this._drawSlime(ctx, s, hw, hh, bob);
            } else {
                this._drawSkeleton(ctx, s, hw, hh, bob);
            }
        }

        // --- HP bar (hanya jika sudah kena damage) ---
        if (this.hp < this.maxHp && !this.dead) {
            const barW = this.width + 12;
            const barH = 4;
            const bx   = s.x - barW / 2;
            const by   = s.y - hh - 10 + bob;
            ctx.fillStyle = '#222';
            ctx.fillRect(bx, by, barW, barH);
            ctx.fillStyle = '#e74c3c';
            ctx.fillRect(bx, by, barW * (this.hp / this.maxHp), barH);
        }

        // --- Attack telegraph ---
        if (this.state === 'attack' && this.attackCooldown > this.attackCooldownMax * 0.65) {
            ctx.strokeStyle = 'rgba(255,60,60,0.45)';
            ctx.lineWidth   = 2;
            ctx.setLineDash([4, 4]);
            ctx.beginPath();
            ctx.arc(s.x, s.y, this.attackRange + 14, 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);
        }

        ctx.restore();
    }

    /** @private */
    _drawSlime(ctx, s, hw, hh, bob) {
        const squish = 1 + Math.sin(this.bobTimer) * 0.12;

        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.ellipse(s.x, s.y + bob, hw * squish, hh / squish, 0, 0, Math.PI * 2);
        ctx.fill();

        // Highlight
        ctx.fillStyle = 'rgba(255,255,255,0.18)';
        ctx.beginPath();
        ctx.ellipse(s.x - 4, s.y - 4 + bob, hw * 0.35, hh * 0.3, -0.3, 0, Math.PI * 2);
        ctx.fill();

        // Eyes
        ctx.fillStyle = '#115511';
        ctx.fillRect(s.x - 7, s.y - 4 + bob, 5, 5);
        ctx.fillRect(s.x + 3, s.y - 4 + bob, 5, 5);
    }

    /** @private */
    _drawSkeleton(ctx, s, hw, hh, bob) {
        // Body
        ctx.fillStyle = this.color;
        ctx.fillRect(s.x - hw, s.y - hh + bob, this.width, this.height);
        ctx.fillStyle = this.innerColor;
        ctx.fillRect(s.x - hw + 3, s.y - hh + 3 + bob, this.width - 6, this.height - 6);

        // Eyes (red glow)
        ctx.fillStyle = '#ff3333';
        ctx.fillRect(s.x - 8, s.y - 8 + bob, 5, 5);
        ctx.fillRect(s.x + 4, s.y - 8 + bob, 5, 5);

        // Mouth (teeth)
        ctx.fillStyle = '#555';
        for (let i = 0; i < 3; i++) {
            ctx.fillRect(s.x - 5 + i * 5, s.y + 3 + bob, 3, 3);
        }

        // Tiny sword
        ctx.strokeStyle = '#aaa';
        ctx.lineWidth   = 2;
        ctx.beginPath();
        ctx.moveTo(s.x + hw - 2, s.y - 2 + bob);
        ctx.lineTo(s.x + hw + 12, s.y - 10 + bob);
        ctx.stroke();
    }
};

// ═══════════════════════════════════════════
//  WAVE SPAWNER
// ═══════════════════════════════════════════
Game.EnemySpawner = class EnemySpawner {

    constructor() {
        this.wave  = 0;
        /** @type {Game.Enemy[]} */
        this.enemies = [];

        this.waveDelay = 3.5;   // jeda antar wave
        this.waveTimer = 2.5;   // delay awal sebelum wave 1
        this.waveActive = false;

        this.enemiesPerWave = 5;
        this.spawnTimer     = 0;
        this.spawnInterval  = 0.4;
        this.enemiesToSpawn = 0;

        this.totalKills = 0;
    }

    reset() {
        this.wave       = 0;
        this.enemies    = [];
        this.waveTimer  = 2.5;
        this.waveActive = false;
        this.enemiesToSpawn = 0;
        this.totalKills = 0;
    }

    update(dt, player) {
        // --- Wave management ---
        if (!this.waveActive) {
            this.waveTimer -= dt;
            if (this.waveTimer <= 0) this._startWave();
        } else {
            // Spawn satu per satu
            if (this.enemiesToSpawn > 0) {
                this.spawnTimer -= dt;
                if (this.spawnTimer <= 0) {
                    this._spawnEnemy(player);
                    this.enemiesToSpawn--;
                    this.spawnTimer = this.spawnInterval;
                }
            }

            // Cek wave selesai
            const alive = this.enemies.filter(e => !e.dead).length;
            if (alive === 0 && this.enemiesToSpawn === 0) {
                this.waveActive = false;
                this.waveTimer  = this.waveDelay;
            }
        }

        // --- Update semua enemy ---
        for (const e of this.enemies) {
            e.update(dt, player);
        }

        // --- Cleanup ---
        this.enemies = this.enemies.filter(e => !e.removing);
    }

    /** @private */
    _startWave() {
        this.wave++;
        this.waveActive     = true;
        this.enemiesPerWave = 4 + this.wave * 2;        // scaling
        this.enemiesToSpawn = this.enemiesPerWave;
        this.spawnTimer     = 0;

        const el = document.getElementById('wave-number');
        if (el) el.textContent = this.wave;
    }

    /** @private */
    _spawnEnemy(player) {
        let x, y;
        let attempts = 0;

        // Spawn di tepi arena, cukup jauh dari player
        do {
            const side   = Math.floor(Math.random() * 4);
            const margin = 60;
            switch (side) {
                case 0: // atas
                    x = margin + Math.random() * (Game.WORLD_W - margin * 2);
                    y = margin;
                    break;
                case 1: // bawah
                    x = margin + Math.random() * (Game.WORLD_W - margin * 2);
                    y = Game.WORLD_H - margin;
                    break;
                case 2: // kiri
                    x = margin;
                    y = margin + Math.random() * (Game.WORLD_H - margin * 2);
                    break;
                case 3: // kanan
                    x = Game.WORLD_W - margin;
                    y = margin + Math.random() * (Game.WORLD_H - margin * 2);
                    break;
            }
            attempts++;
        } while (
            attempts < 12 &&
            Math.sqrt((x - player.x) ** 2 + (y - player.y) ** 2) < 250
        );

        // Tipe musuh (lebih banyak skeleton di wave tinggi)
        const skeletonChance = Math.min(0.8, 0.35 + this.wave * 0.03);
        const type = Math.random() < skeletonChance ? 'skeleton' : 'slime';

        const enemy = new Game.Enemy(x, y, type);

        // Scaling stats per wave
        const hpScale  = 1 + (this.wave - 1) * 0.12;
        const dmgScale = 1 + (this.wave - 1) * 0.06;
        const spdScale = 1 + (this.wave - 1) * 0.03;

        enemy.hp    = Math.floor(enemy.hp * hpScale);
        enemy.maxHp = enemy.hp;
        enemy.damage = Math.floor(enemy.damage * dmgScale);
        enemy.speed *= spdScale;

        this.enemies.push(enemy);
    }

    draw(ctx, camera) {
        for (const e of this.enemies) {
            e.draw(ctx, camera);
        }
    }
};
