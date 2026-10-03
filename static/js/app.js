class Notebook {
    constructor() {
        this.cells = [];
        this.cellCounter = 0;
        this.nextCellId = 1;
        this.isRunning = false;
        
        this.notebook = document.getElementById('notebook');
        this.statusEl = document.getElementById('status');
        this.cellCountEl = document.getElementById('cellCount');
        
        this.initEventListeners();
        this.loadFromStorage();
        this.updateCellNumbers();
        this.render();
    }
    
    initEventListeners() {
        document.getElementById('runAllBtn').addEventListener('click', () => this.runAll());
        document.getElementById('newCellBtn').addEventListener('click', () => this.addCell());
        document.getElementById('saveBtn').addEventListener('click', () => this.save());
        document.getElementById('clearAllBtn').addEventListener('click', () => this.clearAll());
        document.getElementById('restartBtn').addEventListener('click', () => this.restartKernel());
        
        document.addEventListener('keydown', (e) => this.handleKeydown(e));
        
        window.addEventListener('beforeunload', () => this.save());
    }
    
    handleKeydown(e) {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            e.preventDefault();
            const activeCell = document.activeElement.closest('.cell');
            if (activeCell) {
                const cellId = parseInt(activeCell.dataset.cellId);
                this.runCell(cellId);
            }
            return;
        }
        
        if (e.shiftKey && e.key === 'Enter') {
            e.preventDefault();
            const activeCell = document.activeElement.closest('.cell');
            if (activeCell) {
                const cellId = parseInt(activeCell.dataset.cellId);
                this.runCell(cellId);
            }
            return;
        }
        
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
            e.preventDefault();
            this.save();
            return;
        }
        
        if (e.altKey && e.key === 'n') {
            e.preventDefault();
            this.addCell();
            return;
        }
        
        if (e.key === 'Tab') {
            const textarea = document.activeElement;
            if (textarea.classList.contains('cell-editor')) {
                e.preventDefault();
                const start = textarea.selectionStart;
                const end = textarea.selectionEnd;
                textarea.value = textarea.value.substring(0, start) + '    ' + textarea.value.substring(end);
                textarea.selectionStart = textarea.selectionEnd = start + 4;
            }
        }
    }
    
    addCell(code = '', output = '', error = '', index = null) {
        const cellId = this.nextCellId++;
        const cell = {
            id: cellId,
            code: code,
            output: output,
            error: error
        };
        
        if (index !== null && index >= 0 && index <= this.cells.length) {
            this.cells.splice(index, 0, cell);
        } else {
            this.cells.push(cell);
        }
        
        this.render();
        this.focusCell(cellId);
        this.save();
        return cellId;
    }
    
    deleteCell(cellId) {
        this.cells = this.cells.filter(c => c.id !== cellId);
        this.render();
        this.save();
    }
    
    moveCell(cellId, direction) {
        const index = this.cells.findIndex(c => c.id === cellId);
        if (index === -1) return;
        
        const newIndex = index + direction;
        if (newIndex < 0 || newIndex >= this.cells.length) return;
        
        [this.cells[index], this.cells[newIndex]] = [this.cells[newIndex], this.cells[index]];
        this.render();
        this.save();
    }
    
    focusCell(cellId) {
        setTimeout(() => {
            const textarea = document.querySelector(`.cell[data-cell-id="${cellId}"] .cell-editor`);
            if (textarea) textarea.focus();
        }, 0);
    }
    
    async runCell(cellId) {
        const cell = this.cells.find(c => c.id === cellId);
        if (!cell) return;
        
        const cellEl = document.querySelector(`.cell[data-cell-id="${cellId}"]`);
        const outputEl = cellEl.querySelector('.cell-output');
        const numberEl = cellEl.querySelector('.cell-number');
        const runBtn = cellEl.querySelector('.run-btn');
        
        cellEl.classList.add('running');
        runBtn.disabled = true;
        runBtn.textContent = '⏳';
        this.setStatus('Running...');
        
        try {
            const response = await fetch('/run', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code: cell.code, cell_id: cellId })
            });
            
            const result = await response.json();
            
            cell.output = result.output || '';
            cell.error = result.error || '';
            
            this.updateCellOutput(cellId, cell.output, cell.error);
            numberEl.classList.toggle('has-output', !!(cell.output || cell.error));
            
            this.setStatus('Ready');
        } catch (err) {
            cell.error = `Connection error: ${err.message}`;
            this.updateCellOutput(cellId, '', cell.error);
            this.setStatus('Error');
        } finally {
            cellEl.classList.remove('running');
            runBtn.disabled = false;
            runBtn.textContent = '▶ Run';
        }
    }
    
    updateCellOutput(cellId, output, error) {
        const cellEl = document.querySelector(`.cell[data-cell-id="${cellId}"]`);
        const outputEl = cellEl.querySelector('.cell-output');
        
        if (error) {
            outputEl.textContent = error;
            outputEl.className = 'cell-output error';
        } else if (output) {
            outputEl.textContent = output;
            outputEl.className = 'cell-output stdout';
        } else {
            outputEl.textContent = '';
            outputEl.className = 'cell-output empty';
        }
    }
    
    async runAll() {
        if (this.isRunning) return;
        this.isRunning = true;
        this.setStatus('Running all cells...');
        
        for (const cell of this.cells) {
            if (!this.isRunning) break;
            
            const cellEl = document.querySelector(`.cell[data-cell-id="${cell.id}"]`);
            const runBtn = cellEl?.querySelector('.run-btn');
            if (cellEl) cellEl.classList.add('running');
            if (runBtn) { runBtn.disabled = true; runBtn.textContent = '⏳'; }
            
            try {
                const response = await fetch('/run', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ code: cell.code, cell_id: cell.id })
                });
                const result = await response.json();
                
                cell.output = result.output || '';
                cell.error = result.error || '';
                this.updateCellOutput(cell.id, cell.output, cell.error);
                
                const numberEl = cellEl?.querySelector('.cell-number');
                if (numberEl) numberEl.classList.toggle('has-output', !!(cell.output || cell.error));
            } catch (err) {
                cell.error = `Connection error: ${err.message}`;
                this.updateCellOutput(cell.id, '', cell.error);
            }
            
            if (cellEl) cellEl.classList.remove('running');
            if (runBtn) { runBtn.disabled = false; runBtn.textContent = '▶ Run'; }
            
            await new Promise(r => setTimeout(r, 50));
        }
        
        this.isRunning = false;
        this.setStatus('Ready');
        this.save();
    }
    
    clearAll() {
        this.cells.forEach(cell => {
            cell.output = '';
            cell.error = '';
        });
        this.render();
        this.save();
        this.setStatus('All outputs cleared');
    }
    
    async restartKernel() {
        this.setStatus('Restarting kernel...');
        try {
            await fetch('/restart', { method: 'POST' });
            this.setStatus('Kernel restarted');
        } catch (err) {
            this.setStatus('Restart failed');
        }
        this.save();
    }
    
    save() {
        const data = {
            cells: this.cells.map(c => ({
                id: c.id,
                code: c.code,
                output: c.output,
                error: c.error
            })),
            nextCellId: this.nextCellId
        };
        localStorage.setItem('pynotebook', JSON.stringify(data));
    }
    
    loadFromStorage() {
        try {
            const data = JSON.parse(localStorage.getItem('pynotebook') || '{}');
            if (data.cells && data.cells.length > 0) {
                this.cells = data.cells;
                this.nextCellId = data.nextCellId || Math.max(...this.cells.map(c => c.id)) + 1;
            }
        } catch (e) {
            console.warn('Failed to load from storage:', e);
        }
    }
    
    updateCellNumbers() {
        this.cells.forEach((cell, index) => {
            cell.displayNumber = index + 1;
        });
    }
    
    render() {
        this.updateCellNumbers();
        
        if (this.cells.length === 0) {
            this.notebook.innerHTML = `
                <div class="empty-state">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                        <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                    </svg>
                    <p>No cells yet. Click <kbd>+ Code</kbd> or press <kbd>Alt+N</kbd> to add one.</p>
                </div>
            `;
            this.cellCountEl.textContent = '0 cells';
            return;
        }
        
        this.notebook.innerHTML = this.cells.map((cell, index) => this.renderCell(cell, index)).join('');
        this.cellCountEl.textContent = `${this.cells.length} cell${this.cells.length !== 1 ? 's' : ''}`;
        
        this.bindCellEvents();
    }
    
    renderCell(cell, index) {
        const hasOutput = cell.output || cell.error;
        const outputClass = cell.error ? 'error' : (cell.output ? 'stdout' : 'empty');
        
        return `
            <div class="cell" data-cell-id="${cell.id}">
                <div class="cell-header">
                    <span class="cell-number ${hasOutput ? 'has-output' : ''}" data-number="${cell.displayNumber}"></span>
                    <div class="cell-actions">
                        <button class="cell-btn move-up" title="Move Up (Alt+↑)">↑</button>
                        <button class="cell-btn move-down" title="Move Down (Alt+↓)">↓</button>
                        <button class="cell-btn run-btn" title="Run (Ctrl+Enter)">▶ Run</button>
                        <button class="cell-btn clear-output" title="Clear Output">✕</button>
                        <button class="cell-btn delete-btn" title="Delete Cell">🗑</button>
                    </div>
                </div>
                <textarea class="cell-editor" spellcheck="false" placeholder="Enter Python code...">${this.escapeHtml(cell.code)}</textarea>
                <div class="cell-output ${outputClass}">${this.escapeHtml(cell.error || cell.output)}</div>
            </div>
        `;
    }
    
    bindCellEvents() {
        document.querySelectorAll('.cell').forEach(cellEl => {
            const cellId = parseInt(cellEl.dataset.cellId);
            
            const editor = cellEl.querySelector('.cell-editor');
            editor.addEventListener('input', () => {
                const cell = this.cells.find(c => c.id === cellId);
                if (cell) cell.code = editor.value;
            });
            
            cellEl.querySelector('.run-btn').addEventListener('click', () => this.runCell(cellId));
            cellEl.querySelector('.clear-output').addEventListener('click', () => this.clearCellOutput(cellId));
            cellEl.querySelector('.delete-btn').addEventListener('click', () => this.deleteCell(cellId));
            cellEl.querySelector('.move-up').addEventListener('click', () => this.moveCell(cellId, -1));
            cellEl.querySelector('.move-down').addEventListener('click', () => this.moveCell(cellId, 1));
        });
    }
    
    clearCellOutput(cellId) {
        const cell = this.cells.find(c => c.id === cellId);
        if (cell) {
            cell.output = '';
            cell.error = '';
            this.updateCellOutput(cellId, '', '');
            const numberEl = document.querySelector(`.cell[data-cell-id="${cellId}"] .cell-number`);
            if (numberEl) numberEl.classList.remove('has-output');
            this.save();
        }
    }
    
    setStatus(msg) {
        this.statusEl.textContent = msg;
    }
    
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.notebook = new Notebook();
});