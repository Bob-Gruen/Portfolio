document.addEventListener('DOMContentLoaded', function () {
    const canvas = document.getElementById('canvas1');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const simulation = new Simulation(canvas);
    window.simulationInstance = simulation; // Expose for debugging and verification
    simulation.init();
    new Controls(simulation);
});