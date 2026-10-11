/**
 * animation.js — Sprite Sheet Animation System
 *
 * Class `SpriteAnimation` membaca sprite sheet berbasis grid (kolom × baris)
 * dengan fitur:
 *   • Frame rate control
 *   • Looping / one-shot
 *   • Flip-X otomatis (untuk menghadap kiri)
 *   • Impact Frame event listener (saat damage masuk)
 *   • onFinish callback
 *   • Placeholder shape rendering (rect / circle) jika belum ada image
 */

window.Game = window.Game || {};

Game.SpriteAnimation = class SpriteAnimation {

    /**
     * @param {Object} config
     * @param {HTMLImageElement|null} config.image           — Sprite sheet image (null = placeholder)
     * @param {number}               config.frameWidth       — Lebar 1 frame di sprite sheet (px)
     * @param {number}               config.frameHeight      — Tinggi 1 frame di sprite sheet (px)
     * @param {number}               config.columns          — Jumlah kolom di sprite sheet
     * @param {number}               config.rows             — Jumlah baris di sprite sheet
     * @param {number}              [config.totalFrames]      — Jumlah frame total (default = columns × rows)
     * @param {number}              [config.frameRate=10]     — Frame per detik
     * @param {boolean}             [config.loop=true]        — Apakah animasi looping
     * @param {number}              [config.impactFrame=-1]   — Index frame saat damage dikirim (-1 = tidak ada)
     * @param {string}              [config.placeholderColor] — Warna placeholder
     * @param {string}              [config.placeholderShape] — 'rect' | 'circle'
     */
    constructor(config) {
        this.image       = config.image || null;
        this.frameWidth  = config.frameWidth  || 64;
        this.frameHeight = config.frameHeight || 64;
        this.columns     = config.columns || 1;
        this.rows        = config.rows    || 1;
        this.startRow    = config.startRow || 0;
        this.totalFrames = config.totalFrames || (this.columns * this.rows);
        this.frameRate   = config.frameRate   || 10;
        this.loop        = config.loop !== undefined ? config.loop : true;

        // Flip
        this.flipX = false;

        // Playback state
        this.currentFrame = 0;
        this.elapsed      = 0;
        this.finished     = false;
        this.playing      = true;

        // Impact frame
        this.impactFrame    = config.impactFrame !== undefined ? config.impactFrame : -1;
        this.impactTriggered = false;

        // Callbacks
        /** @type {Function|null} */ this.onImpact = null;
        /** @type {Function|null} */ this.onFinish = null;

        // Placeholder
        this.placeholderColor = config.placeholderColor || '#ffffff';
        this.placeholderShape = config.placeholderShape || 'rect';
    }

    /* ---------- Kontrol ---------- */

    reset() {
        this.currentFrame    = 0;
        this.elapsed         = 0;
        this.finished        = false;
        this.impactTriggered = false;
        this.playing         = true;
    }

    play()  { this.playing = true;  }
    pause() { this.playing = false; }

    /** Buat salinan independen (callbacks TIDAK di-copy) */
    clone() {
        return new Game.SpriteAnimation({
            image:            this.image,
            frameWidth:       this.frameWidth,
            frameHeight:      this.frameHeight,
            columns:          this.columns,
            rows:             this.rows,
            startRow:         this.startRow,
            totalFrames:      this.totalFrames,
            frameRate:        this.frameRate,
            loop:             this.loop,
            impactFrame:      this.impactFrame,
            placeholderColor: this.placeholderColor,
            placeholderShape: this.placeholderShape,
        });
    }

    /* ---------- Update ---------- */

    /** @param {number} dt — delta time dalam detik */
    update(dt) {
        if (!this.playing || this.finished) return;

        this.elapsed += dt;
        const frameDuration = 1 / this.frameRate;

        while (this.elapsed >= frameDuration) {
            this.elapsed -= frameDuration;
            this.currentFrame++;

            // Impact frame check
            if (this.currentFrame === this.impactFrame && !this.impactTriggered) {
                this.impactTriggered = true;
                if (this.onImpact) this.onImpact();
            }

            // End of animation
            if (this.currentFrame >= this.totalFrames) {
                if (this.loop) {
                    this.currentFrame    = 0;
                    this.impactTriggered = false;
                } else {
                    this.currentFrame = this.totalFrames - 1;
                    this.finished     = true;
                    this.playing      = false;
                    if (this.onFinish) this.onFinish();
                    break;
                }
            }
        }
    }

    /* ---------- Render ---------- */

    /**
     * Gambar frame saat ini ke canvas.
     * @param {CanvasRenderingContext2D} ctx
     * @param {number} x  — posisi X di layar (top-left atau centered)
     * @param {number} y  — posisi Y di layar (top-left atau centered)
     * @param {number} [width]  — lebar render (default = frameWidth)
     * @param {number} [height] — tinggi render (default = frameHeight)
     * @param {boolean} [centered=false] — apakah x, y adalah titik tengah
     */
    draw(ctx, x, y, width, height, centered = false) {
        const w = width  || this.frameWidth;
        const h = height || this.frameHeight;
        const renderX = centered ? x - w / 2 : x;
        const renderY = centered ? y - h / 2 : y;

        ctx.save();

        if (this.flipX) {
            ctx.translate(renderX + w / 2, renderY);
            ctx.scale(-1, 1);
            ctx.translate(-w / 2, 0);
        } else {
            ctx.translate(renderX, renderY);
        }

        if (this.image) {
            // Sprite sheet rendering
            const col = this.currentFrame % this.columns;
            const row = this.startRow + Math.floor(this.currentFrame / this.columns);
            ctx.drawImage(
                this.image,
                col * this.frameWidth,  row * this.frameHeight,
                this.frameWidth,        this.frameHeight,
                0, 0, w, h
            );
        } else {
            // Placeholder rendering
            this._drawPlaceholder(ctx, w, h);
        }

        ctx.restore();
    }

    /** @private */
    _drawPlaceholder(ctx, w, h) {
        ctx.fillStyle = this.placeholderColor;
        if (this.placeholderShape === 'circle') {
            ctx.beginPath();
            ctx.ellipse(w / 2, h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
            ctx.fill();
        } else {
            ctx.fillRect(0, 0, w, h);
        }
    }

    /* ---------- Utilitas ---------- */

    /** Persentase progress animasi 0..1 */
    getProgress() {
        return this.currentFrame / Math.max(1, this.totalFrames - 1);
    }
};
