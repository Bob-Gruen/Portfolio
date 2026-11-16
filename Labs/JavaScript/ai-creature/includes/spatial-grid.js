class SpatialGrid {
    constructor(width, height, cellSize = 100) {
        this.width = width;
        this.height = height;
        this.cellSize = cellSize;
        this.grid = new Map();
        this._queryResult = [];
    }

    clear() {
        this.grid.clear();
    }

    insert(body) {
        const key = this.getCellKey(body.position.x, body.position.y);
        let cell = this.grid.get(key);
        if (!cell) {
            cell = [];
            this.grid.set(key, cell);
        }
        cell.push(body);
    }

    getCellKey(x, y) {
        const cellX = Math.floor(x / this.cellSize);
        const cellY = Math.floor(y / this.cellSize);
        return (cellX << 16) ^ cellY;
    }

    getNearby(x, y, range) {
        const results = this._queryResult;
        results.length = 0;

        const cellRange = Math.ceil(range / this.cellSize);
        const centerCellX = Math.floor(x / this.cellSize);
        const centerCellY = Math.floor(y / this.cellSize);

        for (let dx = -cellRange; dx <= cellRange; dx++) {
            const cx = centerCellX + dx;
            for (let dy = -cellRange; dy <= cellRange; dy++) {
                const key = (cx << 16) ^ (centerCellY + dy);
                const cell = this.grid.get(key);
                if (cell) {
                    for (let i = 0; i < cell.length; i++) {
                        results.push(cell[i]);
                    }
                }
            }
        }
        return results;
    }
}
