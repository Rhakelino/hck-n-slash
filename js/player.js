/**
 * player.js — Player Logic
 *
 * Fitur:
 *   • 8-arah movement (WASD / Arrow Keys)
 *   • 3-hit combo melee attack (Klik Kiri)
 *     - Hit 1: Tebasan cepat horizontal
 *     - Hit 2: Tebasan ke atas
 *     - Hit 3: Tebasan berat 180° (damage & range lebih besar)
 *   • Dash / Dodge (Spasi) — gerakan cepat, invulnerable, cooldown 1 detik
 *   • AoE Spin Attack (E) — tebasan putar 360°, cooldown 3 detik
 *   • HP system + invulnerability frame saat terkena damage
 */

window.Game = window.Game || {};

Game.Player = class Player {

    constructor(x, y) {
        // Position & size
        this.x = x;
        this.y = y;
        this.width  = 36;
        this.height = 36;

        // Movement
        this.speed = 260;
        this.vx = 0;
        this.vy = 0;

        // HP
        this.hp    = 100;
        this.maxHp = 100;

        // Invulnerability
        this.invulnerable      = false;
        this.invulnerableTimer = 0;
        this.invulnerableDuration = 0.4;

        // Facing direction (towards mouse)
        this.facingX     = 1;
        this.facingY     = 0;
        this.facingAngle = 0;

        // ---- COMBO ATTACK ----
        this.attacking   = false;
        this.comboIndex  = 0;       // 0, 1, 2
        this.comboTimer  = 0;       // countdown setelah serangan selesai
        this.comboWindow = 0.6;     // detik untuk menyambung combo berikutnya
        this.attackTimer = 0;
        this.attackHit   = false;   // apakah damage frame sudah diterapkan

        //                          hit-1    hit-2    hit-3
        this.attackDuration   = [   0.30,    0.30,    0.40  ];
        this.attackDamage     = [   15,      20,      35    ];
        this.attackRange      = [   70,      80,      105   ];
        this.attackArc        = [   Math.PI * 0.55,
                                    Math.PI * 0.55,
                                    Math.PI * 0.85       ];
        this.attackImpactTime = [   0.10,    0.10,    0.15  ]; // waktu setelah awal serangan

        // ---- DASH ----
        this.dashing        = false;
        this.dashTimer      = 0;
        this.dashDuration   = 0.14;
        this.dashSpeed      = 720;
        this.dashCooldown   = 0;
        this.dashCooldownMax = 1.0;
        this.dashDirX = 0;
        this.dashDirY = 0;

        // ---- AoE SPIN ----
        this.spinning        = false;
        this.spinTimer       = 0;
        this.spinDuration    = 0.45;
        this.spinDamage      = 28;
        this.spinRange       = 105;
        this.spinCooldown    = 0;
        this.spinCooldownMax = 3.0;
        this.spinHit    = false;
        this.spinAngle  = 0;

        // ---- BADANG ULTIMATE (FIST CRACK) ----
        this.castingUlti      = false;
        this.ultiDuration     = 2.2;     // Berlangsung 2.2 detik pukulan beruntun
        this.ultiTimer        = 0;
        this.ultiCooldown     = 0;
        this.ultiCooldownMax  = 8.0;     // Cooldown 8 detik
        this.ultiPunchInterval = 0.08;   // Pukulan setiap 80ms (~27 pukulan dahsyat)
        this.ultiPunchTimer   = 0;
        this.ultiDamagePerHit = 9;       // Total potensi ~240 damage jika terkena penuh!
        this.ultiRange        = 185;     // Jangkauan pukulan ke depan
        this.ultiConeAngle    = Math.PI * 0.42; // Sudut kerucut pukulan (~75 derajat)
        this.fistWindList     = [];      // Efek visual proyektil tinju emas (Fist Wind)

        // ---- Misc ----
        this.state = 'idle';   // idle | move | attack | dash | spin | ulti | dead
        this.dead  = false;
        this.flashTimer = 0;   // damage flash

        // ---- SPRITE ANIMATIONS ----
        this.animations = {};
        this.currentAnim = null;
        this.setupAnimations();
    }

    setupAnimations() {
        const sheet = Game.AssetLoader.get('player_sheet');
        if (sheet) {
            this.animations = {
                idle: new Game.SpriteAnimation({
                    image: sheet,
                    frameWidth: 64, frameHeight: 64,
                    columns: 4, rows: 1, startRow: 0,
                    frameRate: 6, loop: true
                }),
                move: new Game.SpriteAnimation({
                    image: sheet,
                    frameWidth: 64, frameHeight: 64,
                    columns: 4, rows: 1, startRow: 1,
                    frameRate: 10, loop: true
                }),
                attack: new Game.SpriteAnimation({
                    image: sheet,
                    frameWidth: 64, frameHeight: 64,
                    columns: 4, rows: 1, startRow: 2,
                    frameRate: 12, loop: false,
                    impactFrame: 2
                }),
                dash: new Game.SpriteAnimation({
                    image: sheet,
                    frameWidth: 64, frameHeight: 64,
                    columns: 4, rows: 1, startRow: 1,
                    frameRate: 14, loop: true
                }),
                spin: new Game.SpriteAnimation({
                    image: sheet,
                    frameWidth: 64, frameHeight: 64,
                    columns: 4, rows: 1, startRow: 2,
                    frameRate: 16, loop: true
                }),
                ulti: new Game.SpriteAnimation({
                    image: sheet,
                    frameWidth: 64, frameHeight: 64,
                    columns: 4, rows: 1, startRow: 2,
                    frameRate: 20, loop: true
                })
            };
            this.currentAnim = this.animations.idle;
        }
    }

    // ═══════════════════════════════════════
    //  UPDATE
    // ═══════════════════════════════════════
    update(dt, enemies) {
        if (this.dead) return;

        // --- Facing ke arah mouse ---
        const dx = Game.Input.mouse.worldX - this.x;
        const dy = Game.Input.mouse.worldY - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 1) {
            this.facingX     = dx / dist;
            this.facingY     = dy / dist;
            this.facingAngle = Math.atan2(dy, dx);
        }

        // --- Cooldowns ---
        if (this.dashCooldown > 0) this.dashCooldown -= dt;
        if (this.spinCooldown > 0) this.spinCooldown -= dt;
        if (this.ultiCooldown > 0) this.ultiCooldown -= dt;
        if (this.flashTimer   > 0) this.flashTimer   -= dt;

        if (this.invulnerableTimer > 0) {
            this.invulnerableTimer -= dt;
            if (this.invulnerableTimer <= 0) this.invulnerable = false;
        }

        if (this.comboTimer > 0) {
            this.comboTimer -= dt;
            if (this.comboTimer <= 0) this.comboIndex = 0; // reset combo
        }

        // Update fist wind projectiles
        for (let i = this.fistWindList.length - 1; i >= 0; i--) {
            const fw = this.fistWindList[i];
            fw.x += fw.vx * dt;
            fw.y += fw.vy * dt;
            fw.life -= dt;
            if (fw.life <= 0) {
                this.fistWindList.splice(i, 1);
            }
        }

        // ========== STATE: ULTI (BADANG FIST CRACK) ==========
        if (this.castingUlti) {
            this.state = 'ulti';
            this.ultiTimer -= dt;
            this.invulnerable = true; // Immune CC / Shield reduction

            // Rapid-fire punches
            this.ultiPunchTimer -= dt;
            if (this.ultiPunchTimer <= 0) {
                this.ultiPunchTimer = this.ultiPunchInterval;
                this._executeUltiPunch(enemies);
            }

            if (this.ultiTimer <= 0) {
                this.castingUlti  = false;
                this.invulnerable = false;
                this.state        = 'idle';
            }
            this._updateAnimation(dt);
            return; // Immobile saat melepaskan Ulti
        }

        // ========== STATE: DASH ==========
        if (this.dashing) {
            this.state = 'dash';
            this.dashTimer -= dt;
            this.x += this.dashDirX * this.dashSpeed * dt;
            this.y += this.dashDirY * this.dashSpeed * dt;
            this._clampToWorld();
            if (this.dashTimer <= 0) {
                this.dashing     = false;
                this.invulnerable = false;
                this.state       = 'idle';
            }
            this._updateAnimation(dt);
            return; // tidak bisa melakukan hal lain saat dash
        }

        // ========== STATE: SPIN ==========
        if (this.spinning) {
            this.state = 'spin';
            this.spinTimer -= dt;
            this.spinAngle += Math.PI * 4.5 * dt; // ~2 putaran penuh

            if (!this.spinHit && this.spinTimer < this.spinDuration * 0.45) {
                this.spinHit = true;
                this._applySpinDamage(enemies);
            }

            if (this.spinTimer <= 0) {
                this.spinning = false;
                this.state    = 'idle';
            }
            this._updateAnimation(dt);
            return;
        }

        // ========== STATE: ATTACK ==========
        if (this.attacking) {
            this.state = 'attack';
            this.attackTimer -= dt;
            const elapsed = this.attackDuration[this.comboIndex] - this.attackTimer;

            if (!this.attackHit && elapsed >= this.attackImpactTime[this.comboIndex]) {
                this.attackHit = true;
                this._applyAttackDamage(enemies);
            }

            if (this.attackTimer <= 0) {
                this.attacking  = false;
                this.comboTimer = this.comboWindow;
                this.comboIndex = (this.comboIndex + 1) % 3;
                this.state      = 'idle';
            }

            // Gerak lambat selama menyerang
            this._applyMovement(dt, 0.25);
            this._clampToWorld();
            this._updateAnimation(dt);
            return;
        }

        // ========== INPUT: ULTI (KEY R) ==========
        if (Game.Input.isJustPressed('KeyR') && this.ultiCooldown <= 0) {
            this._startUlti();
            this._updateAnimation(dt);
            return;
        }

        // ========== INPUT: DASH ==========
        if (Game.Input.isJustPressed('Space') && this.dashCooldown <= 0) {
            this._startDash();
            this._updateAnimation(dt);
            return;
        }

        // ========== INPUT: SPIN ==========
        if (Game.Input.isJustPressed('KeyE') && this.spinCooldown <= 0) {
            this._startSpin();
            this._updateAnimation(dt);
            return;
        }

        // ========== INPUT: ATTACK ==========
        if (Game.Input.mouseJustPressed()) {
            this._startAttack();
            this._updateAnimation(dt);
            return;
        }

        // ========== MOVEMENT ==========
        this._applyMovement(dt, 1.0);
        this._clampToWorld();

        this.state = (this.vx !== 0 || this.vy !== 0) ? 'move' : 'idle';
        this._updateAnimation(dt);
    }

    _updateAnimation(dt) {
        if (!this.animations || Object.keys(this.animations).length === 0) return;

        let targetAnim = this.animations[this.state] || this.animations.idle;
        if (this.currentAnim !== targetAnim) {
            this.currentAnim = targetAnim;
            if (this.state === 'attack' || this.state === 'dash' || this.state === 'spin') {
                this.currentAnim.reset();
            }
        }

        if (this.currentAnim) {
            // Flip horizontal jika menghadap kiri
            this.currentAnim.flipX = (this.facingX < 0);
            this.currentAnim.update(dt);
        }
    }

    // ═══════════════════════════════════════
    //  PRIVATE — MOVEMENT
    // ═══════════════════════════════════════
    _applyMovement(dt, multiplier) {
        let mx = 0, my = 0;
        if (Game.Input.isDown('KeyW') || Game.Input.isDown('ArrowUp'))    my -= 1;
        if (Game.Input.isDown('KeyS') || Game.Input.isDown('ArrowDown'))  my += 1;
        if (Game.Input.isDown('KeyA') || Game.Input.isDown('ArrowLeft'))  mx -= 1;
        if (Game.Input.isDown('KeyD') || Game.Input.isDown('ArrowRight')) mx += 1;

        const len = Math.sqrt(mx * mx + my * my);
        if (len > 0) { mx /= len; my /= len; }

        this.vx = mx * this.speed * multiplier;
        this.vy = my * this.speed * multiplier;
        this.x += this.vx * dt;
        this.y += this.vy * dt;
    }

    // ═══════════════════════════════════════
    //  PRIVATE — DASH
    // ═══════════════════════════════════════
    _startDash() {
        let dx = 0, dy = 0;
        if (Game.Input.isDown('KeyW') || Game.Input.isDown('ArrowUp'))    dy -= 1;
        if (Game.Input.isDown('KeyS') || Game.Input.isDown('ArrowDown'))  dy += 1;
        if (Game.Input.isDown('KeyA') || Game.Input.isDown('ArrowLeft'))  dx -= 1;
        if (Game.Input.isDown('KeyD') || Game.Input.isDown('ArrowRight')) dx += 1;

        const len = Math.sqrt(dx * dx + dy * dy);
        if (len > 0) {
            this.dashDirX = dx / len;
            this.dashDirY = dy / len;
        } else {
            this.dashDirX = this.facingX;
            this.dashDirY = this.facingY;
        }

        this.dashing      = true;
        this.dashTimer    = this.dashDuration;
        this.dashCooldown = this.dashCooldownMax;
        this.invulnerable = true;
        this.state        = 'dash';

        Game.spawnParticles(this.x, this.y, 10, {
            speed: 90, color: '#88ccff', size: 6, life: 0.25, decay: 12
        });
    }

    // ═══════════════════════════════════════
    //  PRIVATE — COMBO ATTACK
    // ═══════════════════════════════════════
    _startAttack() {
        this.attacking   = true;
        this.attackHit   = false;
        this.attackTimer = this.attackDuration[this.comboIndex];
        this.state       = 'attack';
    }

    _applyAttackDamage(enemies) {
        const idx    = this.comboIndex;
        const range  = this.attackRange[idx];
        const arc    = this.attackArc[idx];
        const damage = this.attackDamage[idx];
        let hitAny   = false;

        for (const enemy of enemies) {
            if (enemy.dead) continue;

            const ex = enemy.x - this.x;
            const ey = enemy.y - this.y;
            const d  = Math.sqrt(ex * ex + ey * ey);

            if (d > range + enemy.width / 2) continue;

            // Cek sudut
            const angle = Math.atan2(ey, ex);
            let diff    = angle - this.facingAngle;
            while (diff >  Math.PI) diff -= Math.PI * 2;
            while (diff < -Math.PI) diff += Math.PI * 2;

            if (Math.abs(diff) <= arc / 2) {
                enemy.takeDamage(damage, this.facingX, this.facingY);
                Game.spawnDamageNumber(enemy.x, enemy.y - 20, damage, '#ffcc00');
                hitAny = true;
            }
        }

        if (hitAny) {
            Game.Engine.camera.applyShake(0.1, idx === 2 ? 7 : 3);
            Game.spawnParticles(
                this.x + this.facingX * 45,
                this.y + this.facingY * 45,
                idx === 2 ? 14 : 7,
                { speed: 160, color: '#ffaa00', size: 5, life: 0.3, decay: 9 }
            );
        }
    }

    // ═══════════════════════════════════════
    //  PRIVATE — AoE SPIN
    // ═══════════════════════════════════════
    _startSpin() {
        this.spinning     = true;
        this.spinHit      = false;
        this.spinTimer    = this.spinDuration;
        this.spinCooldown = this.spinCooldownMax;
        this.spinAngle    = this.facingAngle;
        this.state        = 'spin';
    }

    _applySpinDamage(enemies) {
        let hitAny = false;

        for (const enemy of enemies) {
            if (enemy.dead) continue;

            const dx = enemy.x - this.x;
            const dy = enemy.y - this.y;
            const d  = Math.sqrt(dx * dx + dy * dy);

            if (d <= this.spinRange + enemy.width / 2) {
                const nx = d > 0 ? dx / d : 0;
                const ny = d > 0 ? dy / d : 0;
                enemy.takeDamage(this.spinDamage, nx, ny);
                Game.spawnDamageNumber(enemy.x, enemy.y - 20, this.spinDamage, '#ff8800');
                hitAny = true;
            }
        }

        if (hitAny) Game.Engine.camera.applyShake(0.15, 6);

        // Partikel melingkar
        for (let i = 0; i < 18; i++) {
            const a = (Math.PI * 2 / 18) * i;
            Game.spawnParticles(
                this.x + Math.cos(a) * this.spinRange * 0.7,
                this.y + Math.sin(a) * this.spinRange * 0.7,
                2,
                { speed: 70, color: '#ff6600', size: 5, life: 0.35, decay: 7 }
            );
        }
    }

    // ═══════════════════════════════════════
    //  PRIVATE — BADANG ULTIMATE (FIST CRACK)
    // ═══════════════════════════════════════
    _startUlti() {
        this.castingUlti     = true;
        this.ultiTimer       = this.ultiDuration;
        this.ultiCooldown    = this.ultiCooldownMax;
        this.ultiPunchTimer  = 0;
        this.state           = 'ulti';

        // Big activation shockwave
        Game.Engine.camera.applyShake(0.25, 8);
        Game.spawnParticles(this.x, this.y, 25, {
            speed: 180, color: '#f1c40f', size: 6, life: 0.45, decay: 8
        });

        // Broadcast ke teman online
        if (Game.Network) Game.Network.sendAction('ulti');
    }

    _executeUltiPunch(enemies) {
        // Setiap pukulan sedikit menggetarkan kamera
        Game.Engine.camera.applyShake(0.06, 2.5);

        // Random jitter angle dalam kerucut serangan
        const angleSpread = (Math.random() - 0.5) * this.ultiConeAngle;
        const punchAngle  = this.facingAngle + angleSpread;
        const punchDist   = 40 + Math.random() * (this.ultiRange - 40);

        const fx = this.x + Math.cos(punchAngle) * punchDist;
        const fy = this.y + Math.sin(punchAngle) * punchDist;

        // Fist Wind projectile visual
        this.fistWindList.push({
            x: this.x + Math.cos(this.facingAngle) * 20 + (Math.random() - 0.5) * 16,
            y: this.y + Math.sin(this.facingAngle) * 20 + (Math.random() - 0.5) * 16,
            vx: Math.cos(punchAngle) * 580,
            vy: Math.sin(punchAngle) * 580,
            angle: punchAngle,
            size: 14 + Math.random() * 8,
            life: 0.35,
            maxLife: 0.35
        });

        // Partikel ledakan pukulan
        Game.spawnParticles(fx, fy, 4, {
            speed: 120, color: '#f39c12', size: 4, life: 0.2, decay: 10
        });

        // Cek damage ke musuh dalam cone
        for (const enemy of enemies) {
            if (enemy.dead) continue;

            const dx = enemy.x - this.x;
            const dy = enemy.y - this.y;
            const d  = Math.sqrt(dx * dx + dy * dy);

            if (d <= this.ultiRange + enemy.width / 2) {
                const a = Math.atan2(dy, dx);
                let diff = a - this.facingAngle;
                while (diff >  Math.PI) diff -= Math.PI * 2;
                while (diff < -Math.PI) diff += Math.PI * 2;

                if (Math.abs(diff) <= this.ultiConeAngle / 2 + 0.15) {
                    const nx = d > 0 ? dx / d : this.facingX;
                    const ny = d > 0 ? dy / d : this.facingY;

                    // Knockback konstan Badang mendorong musuh menjauh
                    enemy.takeDamage(this.ultiDamagePerHit, nx * 0.4, ny * 0.4);
                    Game.spawnDamageNumber(enemy.x, enemy.y - 18, this.ultiDamagePerHit, '#ffd700');
                }
            }
        }
    }

    // ═══════════════════════════════════════
    //  TAKE DAMAGE
    // ═══════════════════════════════════════
    takeDamage(amount) {
        if (this.invulnerable || this.dead) return;

        this.hp -= amount;
        this.flashTimer = 0.18;
        this.invulnerable      = true;
        this.invulnerableTimer = this.invulnerableDuration;

        Game.spawnDamageNumber(this.x, this.y - 24, amount, '#ff4444');
        Game.spawnParticles(this.x, this.y, 8, {
            speed: 120, color: '#ff3333', size: 4, life: 0.3, decay: 7
        });

        if (this.hp <= 0) {
            this.hp    = 0;
            this.dead  = true;
            this.state = 'dead';
            if (Game.onPlayerDeath) Game.onPlayerDeath();
        }
    }

    // ═══════════════════════════════════════
    //  CLAMP
    // ═══════════════════════════════════════
    _clampToWorld() {
        const hw = this.width  / 2;
        const hh = this.height / 2;
        const wallMargin = 20; // tembok 20px
        this.x = Math.max(hw + wallMargin, Math.min(Game.WORLD_W - hw - wallMargin, this.x));
        this.y = Math.max(hh + wallMargin, Math.min(Game.WORLD_H - hh - wallMargin, this.y));
    }

    // ═══════════════════════════════════════
    //  DRAW (Placeholder colored shapes)
    // ═══════════════════════════════════════
    draw(ctx, camera) {
        const s  = camera.worldToScreen(this.x, this.y);
        const hw = this.width  / 2;
        const hh = this.height / 2;

        ctx.save();

        // Damage flash blink
        if (this.flashTimer > 0 && Math.floor(this.flashTimer * 20) % 2 === 0) {
            ctx.globalAlpha = 0.4;
        }

        // Dash ghost trail
        if (this.dashing) {
            ctx.globalAlpha = 0.25;
            ctx.fillStyle = '#88ccff';
            ctx.fillRect(
                s.x - hw - this.dashDirX * 22,
                s.y - hh - this.dashDirY * 22,
                this.width, this.height
            );
            ctx.globalAlpha = this.flashTimer > 0 ? 0.4 : 1;
        }

        // --- Shadow ---
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.beginPath();
        ctx.ellipse(s.x, s.y + hh + 3, hw * 0.8, 5, 0, 0, Math.PI * 2);
        ctx.fill();

        // --- Sprite Animation or Placeholder ---
        if (this.currentAnim && this.currentAnim.image) {
            // Render 64x64 sprite centered at player
            this.currentAnim.draw(ctx, s.x, s.y, 64, 64, true);
        } else {
            // Fallback body
            const bodyColor = this.dead ? '#556' : '#4488ff';
            ctx.fillStyle = bodyColor;
            ctx.fillRect(s.x - hw, s.y - hh, this.width, this.height);

            // Inner highlight
            ctx.fillStyle = this.dead ? '#667' : '#66aaff';
            ctx.fillRect(s.x - hw + 4, s.y - hh + 4, this.width - 8, this.height - 8);

            // --- Eyes ---
            if (!this.dead) {
                const ex = this.facingX * 5;
                const ey = this.facingY * 5;
                ctx.fillStyle = '#fff';
                ctx.fillRect(s.x - 6 + ex, s.y - 7 + ey, 5, 5);
                ctx.fillRect(s.x + 2 + ex, s.y - 7 + ey, 5, 5);
                // Pupil
                ctx.fillStyle = '#112';
                ctx.fillRect(s.x - 5 + ex + this.facingX * 2, s.y - 6 + ey + this.facingY * 2, 3, 3);
                ctx.fillRect(s.x + 3 + ex + this.facingX * 2, s.y - 6 + ey + this.facingY * 2, 3, 3);
            }
        }

        // --- Attack Visual ---
        if (this.attacking)   this._drawAttackArc(ctx, s);
        if (this.spinning)    this._drawSpinEffect(ctx, s);
        if (this.castingUlti) this._drawUltiEffect(ctx, s, camera);

        // --- Fist Wind Projectiles on Screen ---
        this._drawFistWinds(ctx, camera);

        ctx.restore();
    }

    /** @private */
    _drawAttackArc(ctx, screenPos) {
        const idx      = this.comboIndex;
        const progress = 1 - (this.attackTimer / this.attackDuration[idx]);
        const range    = this.attackRange[idx];
        const arc      = this.attackArc[idx];

        // Sword swing angle
        const swingOffset = (progress - 0.5) * arc;
        const swordAngle  = this.facingAngle + swingOffset;

        // Sword blade
        const bladeLen = range * 0.85;
        ctx.strokeStyle = idx === 2 ? '#ffd060' : '#eee';
        ctx.lineWidth   = idx === 2 ? 5 : 3;
        ctx.lineCap     = 'round';
        ctx.beginPath();
        ctx.moveTo(screenPos.x, screenPos.y);
        ctx.lineTo(
            screenPos.x + Math.cos(swordAngle) * bladeLen,
            screenPos.y + Math.sin(swordAngle) * bladeLen
        );
        ctx.stroke();

        // Arc trail
        ctx.strokeStyle = idx === 2 ? 'rgba(255,160,0,0.55)' : 'rgba(255,255,255,0.35)';
        ctx.lineWidth   = idx === 2 ? 7 : 3;
        ctx.beginPath();
        ctx.arc(
            screenPos.x, screenPos.y,
            range * 0.7,
            this.facingAngle - arc / 2,
            this.facingAngle - arc / 2 + arc * progress
        );
        ctx.stroke();

        // Impact flash
        if (this.attackHit && progress < 0.55) {
            ctx.fillStyle = 'rgba(255,220,80,0.25)';
            ctx.beginPath();
            ctx.arc(screenPos.x, screenPos.y, range * 0.5, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    /** @private */
    _drawSpinEffect(ctx, screenPos) {
        const progress = 1 - (this.spinTimer / this.spinDuration);

        // Spinning blade
        ctx.strokeStyle = '#ff7700';
        ctx.lineWidth   = 5;
        ctx.lineCap     = 'round';
        ctx.beginPath();
        ctx.moveTo(screenPos.x, screenPos.y);
        ctx.lineTo(
            screenPos.x + Math.cos(this.spinAngle) * this.spinRange * 0.85,
            screenPos.y + Math.sin(this.spinAngle) * this.spinRange * 0.85
        );
        ctx.stroke();

        // Circle outline
        ctx.strokeStyle = `rgba(255,120,0,${0.45 * (1 - progress)})`;
        ctx.lineWidth   = 3;
        ctx.beginPath();
        ctx.arc(screenPos.x, screenPos.y, this.spinRange, 0, Math.PI * 2);
        ctx.stroke();

        // Trail ghosts
        for (let i = 1; i <= 3; i++) {
            const ta = this.spinAngle - Math.PI * 0.25 * i;
            ctx.strokeStyle = `rgba(255,160,0,${0.3 - i * 0.08})`;
            ctx.lineWidth   = 3;
            ctx.beginPath();
            ctx.moveTo(screenPos.x, screenPos.y);
            ctx.lineTo(
                screenPos.x + Math.cos(ta) * this.spinRange * 0.6,
                screenPos.y + Math.sin(ta) * this.spinRange * 0.6
            );
            ctx.stroke();
        }
    }

    /** @private Badang Golden Shield Aura & Cone Telegraph */
    _drawUltiEffect(ctx, screenPos, camera) {
        // Golden shield aura around player (Badang Shield / CC Immunity)
        const pulse = 1 + Math.sin(performance.now() * 0.02) * 0.08;
        ctx.strokeStyle = '#ffd700';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(screenPos.x, screenPos.y, 28 * pulse, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = 'rgba(255, 215, 0, 0.18)';
        ctx.beginPath();
        ctx.arc(screenPos.x, screenPos.y, 28 * pulse, 0, Math.PI * 2);
        ctx.fill();

        // Punch Cone Telegraph (Golden Shockwave Cone)
        ctx.save();
        ctx.fillStyle = 'rgba(255, 200, 0, 0.12)';
        ctx.strokeStyle = 'rgba(255, 220, 50, 0.4)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(screenPos.x, screenPos.y);
        ctx.arc(
            screenPos.x, screenPos.y,
            this.ultiRange,
            this.facingAngle - this.ultiConeAngle / 2,
            this.facingAngle + this.ultiConeAngle / 2
        );
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
    }

    /** @private Render badang golden flying fists (Fist Winds) */
    _drawFistWinds(ctx, camera) {
        for (const fw of this.fistWindList) {
            const s = camera.worldToScreen(fw.x, fw.y);
            const alpha = Math.max(0, fw.life / fw.maxLife);

            ctx.save();
            ctx.translate(s.x, s.y);
            ctx.rotate(fw.angle);
            ctx.globalAlpha = alpha;

            // Golden Fist Glow
            ctx.fillStyle = '#f1c40f';
            ctx.beginPath();
            ctx.ellipse(0, 0, fw.size, fw.size * 0.65, 0, 0, Math.PI * 2);
            ctx.fill();

            // Inner Bright Core
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.ellipse(2, 0, fw.size * 0.55, fw.size * 0.35, 0, 0, Math.PI * 2);
            ctx.fill();

            // Fist wind tail / shockwave streak
            ctx.strokeStyle = 'rgba(243, 156, 18, 0.6)';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(-fw.size * 1.4, 0);
            ctx.lineTo(-2, 0);
            ctx.stroke();

            ctx.restore();
        }
    }
};
