/**
 * asset_generator.js — Procedural Pixel-Art Sprite Sheet Generator
 *
 * Mengenerate canvas image untuk demo sprite sheet dinamis:
 * - 'player_sheet': 64x64 per frame, 4 frame idle, 4 frame walk, 4 frame attack
 * - 'skeleton_sheet': 48x48 per frame, 4 frame walk, 3 frame attack
 * - 'slime_sheet': 32x32 per frame, 4 frame bounce
 *
 * Ini membuktikan bahwa sistem Game.SpriteAnimation bekerja penuh dengan image asli!
 */

window.Game = window.Game || {};

Game.AssetGenerator = {
    generateAll() {
        const assets = {};
        assets['player_sheet'] = this.createPlayerSheet();
        assets['skeleton_sheet'] = this.createSkeletonSheet();
        assets['slime_sheet'] = this.createSlimeSheet();

        for (const key in assets) {
            Game.AssetLoader.assets[key] = assets[key];
        }
        console.log('[AssetGenerator] Procedural sprite sheets generated & registered to AssetLoader!');
    },

    createPlayerSheet() {
        // 64x64 frame, 4 kolom x 3 baris
        // Row 0: Idle (4 frames)
        // Row 1: Walk (4 frames)
        // Row 2: Attack (4 frames, impact frame di frame 2)
        const fw = 64, fh = 64;
        const canvas = document.createElement('canvas');
        canvas.width = fw * 4;
        canvas.height = fh * 3;
        const ctx = canvas.getContext('2d');

        // Helper draw character base
        function drawKnight(cx, cy, bob, legOffset, armAngle, hasSwordSwing, swingProgress) {
            ctx.save();
            ctx.translate(cx, cy + bob);

            // Shadow
            ctx.fillStyle = 'rgba(0,0,0,0.3)';
            ctx.beginPath();
            ctx.ellipse(0, 20, 14, 5, 0, 0, Math.PI * 2);
            ctx.fill();

            // Cape / cloak
            ctx.fillStyle = '#2c3e50';
            ctx.beginPath();
            ctx.moveTo(-10, -2);
            ctx.lineTo(-14, 16);
            ctx.lineTo(-4, 16);
            ctx.fill();

            // Legs
            ctx.fillStyle = '#1e272e';
            ctx.fillRect(-8 + legOffset, 8, 6, 12);
            ctx.fillRect(2 - legOffset, 8, 6, 12);

            // Body Armor (Torso)
            ctx.fillStyle = '#3498db';
            ctx.fillRect(-10, -8, 20, 18);
            ctx.fillStyle = '#2980b9';
            ctx.fillRect(-8, -6, 16, 14);

            // Gold chest emblem
            ctx.fillStyle = '#f1c40f';
            ctx.fillRect(-3, -3, 6, 8);
            ctx.fillRect(-6, -1, 12, 4);

            // Head / Helmet
            ctx.fillStyle = '#7f8c8d';
            ctx.beginPath();
            ctx.arc(0, -16, 10, 0, Math.PI * 2);
            ctx.fill();
            // Helmet visor
            ctx.fillStyle = '#1e272e';
            ctx.fillRect(-7, -18, 14, 5);
            // Visor glow
            ctx.fillStyle = '#00ffff';
            ctx.fillRect(-4, -17, 3, 3);
            ctx.fillRect(1, -17, 3, 3);
            // Crest
            ctx.fillStyle = '#e74c3c';
            ctx.fillRect(-3, -28, 6, 8);

            // Sword / Arm
            if (!hasSwordSwing) {
                ctx.save();
                ctx.translate(10, 0);
                ctx.rotate(armAngle);
                // Arm
                ctx.fillStyle = '#3498db';
                ctx.fillRect(-3, -3, 6, 10);
                // Sword hilt
                ctx.fillStyle = '#e67e22';
                ctx.fillRect(-4, 7, 8, 3);
                // Blade
                ctx.fillStyle = '#ecf0f1';
                ctx.fillRect(-2, 10, 4, 18);
                ctx.restore();
            } else {
                // Slash swing
                const a = -Math.PI * 0.4 + swingProgress * Math.PI * 0.8;
                ctx.save();
                ctx.translate(6, -2);
                ctx.rotate(a);
                ctx.fillStyle = '#ecf0f1';
                ctx.fillRect(-2, -26, 5, 28);
                // Hilt
                ctx.fillStyle = '#f39c12';
                ctx.fillRect(-6, -2, 13, 4);
                ctx.restore();

                // Slash FX trail
                if (swingProgress > 0.2) {
                    ctx.strokeStyle = 'rgba(236, 240, 241, ' + (1 - swingProgress * 0.6) + ')';
                    ctx.lineWidth = 3;
                    ctx.beginPath();
                    ctx.arc(6, -2, 28, -Math.PI * 0.4, a);
                    ctx.stroke();
                }
            }

            ctx.restore();
        }

        // Row 0: Idle
        for (let i = 0; i < 4; i++) {
            const cx = i * fw + fw / 2;
            const cy = 0 * fh + fh / 2 + 6;
            const bob = Math.sin(i * Math.PI / 2) * 1.5;
            drawKnight(cx, cy, bob, 0, 0.2, false, 0);
        }

        // Row 1: Walk
        for (let i = 0; i < 4; i++) {
            const cx = i * fw + fw / 2;
            const cy = 1 * fh + fh / 2 + 6;
            const bob = Math.abs(Math.sin(i * Math.PI / 2)) * -2.5;
            const leg = Math.sin(i * Math.PI / 2) * 4;
            const arm = Math.sin(i * Math.PI / 2) * 0.5;
            drawKnight(cx, cy, bob, leg, arm, false, 0);
        }

        // Row 2: Attack (Slash combo)
        for (let i = 0; i < 4; i++) {
            const cx = i * fw + fw / 2;
            const cy = 2 * fh + fh / 2 + 6;
            const progress = i / 3;
            drawKnight(cx, cy, 0, 2, 0, true, progress);
        }

        return canvas;
    },

    createSkeletonSheet() {
        // 48x48 frame, 4 kolom x 2 baris (Walk & Attack)
        const fw = 48, fh = 48;
        const canvas = document.createElement('canvas');
        canvas.width = fw * 4;
        canvas.height = fh * 2;
        const ctx = canvas.getContext('2d');

        function drawSkelly(cx, cy, bob, legOffset, slash) {
            ctx.save();
            ctx.translate(cx, cy + bob);

            // Shadow
            ctx.fillStyle = 'rgba(0,0,0,0.3)';
            ctx.beginPath();
            ctx.ellipse(0, 16, 11, 4, 0, 0, Math.PI * 2);
            ctx.fill();

            // Bone Legs
            ctx.fillStyle = '#dfe6e9';
            ctx.fillRect(-6 + legOffset, 6, 3, 10);
            ctx.fillRect(3 - legOffset, 6, 3, 10);

            // Ribs / Spine
            ctx.fillStyle = '#b2bec3';
            ctx.fillRect(-1, -4, 3, 11);
            ctx.fillRect(-6, -2, 13, 2);
            ctx.fillRect(-5, 1, 11, 2);
            ctx.fillRect(-4, 4, 9, 2);

            // Skull
            ctx.fillStyle = '#f5f6fa';
            ctx.beginPath();
            ctx.arc(0, -11, 8, 0, Math.PI * 2);
            ctx.fill();
            // Jaw
            ctx.fillRect(-4, -5, 8, 4);

            // Glowing red eye sockets
            ctx.fillStyle = '#d63031';
            ctx.fillRect(-5, -13, 3, 3);
            ctx.fillRect(2, -13, 3, 3);

            // Rusted scythe / sword
            ctx.save();
            const sa = slash ? -Math.PI * 0.3 + slash * Math.PI * 0.7 : 0.2;
            ctx.translate(8, 0);
            ctx.rotate(sa);
            ctx.fillStyle = '#7f8c8d';
            ctx.fillRect(-1, -18, 3, 20);
            ctx.fillStyle = '#c0392b';
            ctx.fillRect(-4, -20, 8, 3);
            ctx.restore();

            ctx.restore();
        }

        // Row 0: Walk
        for (let i = 0; i < 4; i++) {
            const cx = i * fw + fw / 2;
            const cy = 0 * fh + fh / 2 + 5;
            const bob = Math.abs(Math.sin(i * Math.PI / 2)) * -2;
            const leg = Math.sin(i * Math.PI / 2) * 3;
            drawSkelly(cx, cy, bob, leg, 0);
        }

        // Row 1: Attack
        for (let i = 0; i < 4; i++) {
            const cx = i * fw + fw / 2;
            const cy = 1 * fh + fh / 2 + 5;
            drawSkelly(cx, cy, 0, 1, (i + 1) / 4);
        }

        return canvas;
    },

    createSlimeSheet() {
        // 32x32 frame, 4 kolom x 1 baris (Bounce animation)
        const fw = 32, fh = 32;
        const canvas = document.createElement('canvas');
        canvas.width = fw * 4;
        canvas.height = fh;
        const ctx = canvas.getContext('2d');

        for (let i = 0; i < 4; i++) {
            const cx = i * fw + fw / 2;
            const cy = fh / 2 + 4;
            const bounce = [0, -4, -6, -2][i];
            const squishX = [1.2, 0.9, 0.8, 1.1][i];
            const squishY = [0.8, 1.1, 1.2, 0.9][i];

            ctx.save();
            ctx.translate(cx, cy + bounce);

            // Shadow
            ctx.fillStyle = 'rgba(0,0,0,0.25)';
            ctx.beginPath();
            ctx.ellipse(0, 9 - bounce, 10 / squishX, 3, 0, 0, Math.PI * 2);
            ctx.fill();

            // Jelly body
            ctx.fillStyle = '#2ecc71';
            ctx.beginPath();
            ctx.ellipse(0, 0, 11 * squishX, 9 * squishY, 0, 0, Math.PI * 2);
            ctx.fill();

            // Inner gloss
            ctx.fillStyle = '#a8e6cf';
            ctx.beginPath();
            ctx.ellipse(-3, -3, 5 * squishX, 3 * squishY, -0.2, 0, Math.PI * 2);
            ctx.fill();

            // Cute eyes
            ctx.fillStyle = '#1e272e';
            ctx.fillRect(-5, -2, 3, 4);
            ctx.fillRect(2, -2, 3, 4);
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(-5, -3, 2, 2);
            ctx.fillRect(2, -3, 2, 2);

            ctx.restore();
        }

        return canvas;
    }
};
