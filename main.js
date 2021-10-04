function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

window.onload = async() => {
    await sleep(1000);
    if (propogate()) {
        document.getElementById("loading-text").innerHTML = "rendering assets..."
    }
    await sleep(500);
    document.getElementById("panel").style.display = "block";
    document.getElementById("orbit").style.display = "block";
}