class Lake {
    constructor(canvas, Matter, engine) {
        this.canvas = canvas;
        this.Matter = Matter;
        this.engine = engine;
        this.shallowWater = [];
        this.deepWater = [];

        this.centerX = 0;
        this.centerY = 0;
        this.baseRadius = 0;
        this.shallowPoints = [];
        this.deepPoints = [];
        this.lilyPads = [];
    }

    create() {
        const margin = 200;
        const availW = Math.max(200, this.canvas.width - margin * 2);
        const availH = Math.max(200, this.canvas.height - margin * 2);
        this.centerX = Math.random() * availW + margin;
        this.centerY = Math.random() * availH + margin;
        this.baseRadius = Math.random() * 80 + 100;
        const complexity = 40;

        this.shallowPoints = this._generateOrganicPoints(this.centerX, this.centerY, this.baseRadius, complexity);
        this.deepPoints = this._generateOrganicPoints(this.centerX, this.centerY, this.baseRadius * 0.58, complexity);

        this._createWaterSensor(this.centerX, this.centerY, this.shallowPoints, 'shallow_water', this.shallowWater);
        this._createWaterSensor(this.centerX, this.centerY, this.deepPoints, 'deep_water', this.deepWater);

        // Generate decorative lily pads in the shallow zone
        this.lilyPads = [];
        const padCount = 7 + Math.floor(Math.random() * 5);
        for (let i = 0; i < padCount; i++) {
            const angle = Math.random() * Math.PI * 2;
            const dist = this.baseRadius * (0.62 + Math.random() * 0.25);
            this.lilyPads.push({
                x: this.centerX + Math.cos(angle) * dist,
                y: this.centerY + Math.sin(angle) * dist,
                radius: 7 + Math.random() * 6,
                rotation: Math.random() * Math.PI * 2,
                hasFlower: Math.random() < 0.35,
                phase: Math.random() * Math.PI * 2
            });
        }
    }

    _generateOrganicPoints(cx, cy, radius, complexity) {
        const points = [];
        const noisePoints = 12;
        const noiseStrength = 0.35;
        const randomValues = [];
        for (let i = 0; i < noisePoints; i++) {
            randomValues.push(Math.random());
        }

        for (let i = 0; i < complexity; i++) {
            const angle = (i / complexity) * 2 * Math.PI;
            const noiseIndex = (angle / (2 * Math.PI)) * noisePoints;
            const index1 = Math.floor(noiseIndex) % noisePoints;
            const index2 = (index1 + 1) % noisePoints;
            const blend = noiseIndex - Math.floor(noiseIndex);
            const cosBlend = (1 - Math.cos(blend * Math.PI)) / 2;
            const noiseValue = randomValues[index1] * (1 - cosBlend) + randomValues[index2] * cosBlend;

            const r = radius * (1 + (noiseValue - 0.5) * 2 * noiseStrength);
            points.push({
                x: cx + Math.cos(angle) * r,
                y: cy + Math.sin(angle) * r
            });
        }
        return points;
    }

    _createWaterSensor(cx, cy, points, label, bodyArray) {
        const waterBody = this.Matter.Bodies.fromVertices(cx, cy, [points], {
            isStatic: true,
            isSensor: true,
            label: label,
            render: { visible: false }
        });

        if (waterBody) {
            // Tag for fast raycasting
            waterBody.rayRadius = label === 'deep_water' ? this.baseRadius * 0.58 : this.baseRadius;
            this.Matter.World.add(this.engine.world, waterBody);
            bodyArray.push(waterBody);
        }
    }

    draw(ctx, timeSeconds) {
        if (this.shallowPoints.length === 0) return;

        ctx.save();

        // 1. Soft mossy / golden-pebble shoreline glow
        this._traceSmoothClosedPath(ctx, this.shallowPoints);
        ctx.strokeStyle = 'rgba(218, 195, 130, 0.55)';
        ctx.lineWidth = 22;
        ctx.lineJoin = 'round';
        ctx.stroke();

        ctx.strokeStyle = 'rgba(139, 175, 105, 0.5)';
        ctx.lineWidth = 34;
        ctx.stroke();

        // 2. Shallow enchanted turquoise water
        const shallowGrad = ctx.createRadialGradient(
            this.centerX, this.centerY, this.baseRadius * 0.2,
            this.centerX, this.centerY, this.baseRadius * 1.25
        );
        shallowGrad.addColorStop(0, 'rgba(64, 196, 215, 0.78)');
        shallowGrad.addColorStop(0.7, 'rgba(77, 208, 225, 0.68)');
        shallowGrad.addColorStop(1, 'rgba(128, 222, 234, 0.52)');

        this._traceSmoothClosedPath(ctx, this.shallowPoints);
        ctx.fillStyle = shallowGrad;
        ctx.fill();

        // Shore foam highlight
        ctx.strokeStyle = 'rgba(224, 247, 250, 0.55)';
        ctx.lineWidth = 3;
        ctx.stroke();

        // 3. Deep sapphire-indigo pool
        if (this.deepPoints.length > 0) {
            const deepGrad = ctx.createRadialGradient(
                this.centerX, this.centerY, 10,
                this.centerX, this.centerY, this.baseRadius * 0.75
            );
            deepGrad.addColorStop(0, 'rgba(26, 35, 126, 0.75)');
            deepGrad.addColorStop(0.6, 'rgba(21, 101, 192, 0.68)');
            deepGrad.addColorStop(1, 'rgba(2, 136, 209, 0.45)');

            this._traceSmoothClosedPath(ctx, this.deepPoints);
            ctx.fillStyle = deepGrad;
            ctx.fill();
        }

        // 4. Subtle animated water ripples
        for (let i = 0; i < 3; i++) {
            const phase = ((timeSeconds * 0.35 + i * 0.33) % 1);
            const rippleR = this.baseRadius * (0.2 + phase * 0.55);
            const alpha = (1 - phase) * 0.25;
            ctx.beginPath();
            ctx.arc(this.centerX, this.centerY, rippleR, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(224, 247, 250, ${alpha})`;
            ctx.lineWidth = 1.5;
            ctx.stroke();
        }

        // 5. Floating lily pads & lotus blossoms
        for (const pad of this.lilyPads) {
            const bobX = pad.x + Math.sin(timeSeconds * 1.2 + pad.phase) * 1.5;
            const bobY = pad.y + Math.cos(timeSeconds * 1.0 + pad.phase) * 1.5;

            ctx.save();
            ctx.translate(bobX, bobY);
            ctx.rotate(pad.rotation + Math.sin(timeSeconds * 0.6 + pad.phase) * 0.08);

            // Pad shadow
            ctx.beginPath();
            ctx.arc(1, 2, pad.radius, 0.25, Math.PI * 2 - 0.25);
            ctx.lineTo(1, 2);
            ctx.closePath();
            ctx.fillStyle = 'rgba(0, 40, 50, 0.22)';
            ctx.fill();

            // Pad leaf
            ctx.beginPath();
            ctx.arc(0, 0, pad.radius, 0.25, Math.PI * 2 - 0.25);
            ctx.lineTo(0, 0);
            ctx.closePath();
            ctx.fillStyle = '#4CAF50';
            ctx.fill();
            ctx.strokeStyle = '#2E7D32';
            ctx.lineWidth = 1;
            ctx.stroke();

            if (pad.hasFlower) {
                // Tiny lotus flower
                ctx.fillStyle = '#F48FB1';
                for (let p = 0; p < 5; p++) {
                    const a = (p / 5) * Math.PI * 2;
                    ctx.beginPath();
                    ctx.ellipse(Math.cos(a) * 2.5, Math.sin(a) * 2.5, 2.5, 1.4, a, 0, Math.PI * 2);
                    ctx.fill();
                }
                ctx.beginPath();
                ctx.arc(0, 0, 1.6, 0, Math.PI * 2);
                ctx.fillStyle = '#FFF59D';
                ctx.fill();
            }

            ctx.restore();
        }

        ctx.restore();
    }

    _traceSmoothClosedPath(ctx, pts) {
        if (pts.length < 3) return;
        ctx.beginPath();
        const firstMidX = (pts[0].x + pts[pts.length - 1].x) * 0.5;
        const firstMidY = (pts[0].y + pts[pts.length - 1].y) * 0.5;
        ctx.moveTo(firstMidX, firstMidY);
        for (let i = 0; i < pts.length; i++) {
            const curr = pts[i];
            const next = pts[(i + 1) % pts.length];
            const midX = (curr.x + next.x) * 0.5;
            const midY = (curr.y + next.y) * 0.5;
            ctx.quadraticCurveTo(curr.x, curr.y, midX, midY);
        }
        ctx.closePath();
    }
}
