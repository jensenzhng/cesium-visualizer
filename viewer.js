const totalSeconds = 60 * 60 * 3;
const timestepInSeconds = 200;
const start = Cesium.JulianDate.fromDate(new Date());
const stop = Cesium.JulianDate.addSeconds(start, totalSeconds, new Cesium.JulianDate());
const startTime = Cesium.JulianDate.addSeconds(start, -totalSeconds, new Cesium.JulianDate());
const endTime = Cesium.JulianDate.addSeconds(start, totalSeconds - 600, new Cesium.JulianDate());
let entityArr = [];

async function getData() {
    let satelliteArr = [];
    const res = await fetch('https://us-central1-stars-5145f.cloudfunctions.net/app/catalog2');
    let orbitalsArr = await res.json();

    let length = orbitalsArr.length;

    for (let i = 0; i < length - 1; i += 3) {
        const satrec = satellite.twoline2satrec(
            orbitalsArr[i].TLE_LINE1,
            orbitalsArr[i].TLE_LINE2
        );
        satelliteArr.push(satrec)
    }
    return {
        satArr: satelliteArr,
        orbArr: orbitalsArr
    };
}

async function loadViewer(satArr) {
    const clock = new Cesium.Clock({
        startTime: startTime,
        stopTime: endTime,
        currentTime: start,
        clockRange: Cesium.ClockRange.CLAMPED, // loop when we hit the end time
        canAnimate: true,
        shouldAnimate: true,
    });

    const clockViewModel = new Cesium.ClockViewModel(clock);

    const viewer = new Cesium.Viewer('cesiumContainer', {
        imageryProvider: new Cesium.TileMapServiceImageryProvider({
            url: Cesium.buildModuleUrl("Assets/Textures/NaturalEarthII"),
        }),
        baseLayerPicker: false,
        geocoder: false,
        homeButton: true,
        infoBox: false,
        navigationHelpButton: true,
        sceneModePicker: false,
        selectionIndicator: false,
        clockViewModel
    });
    viewer.scene.globe.enableLighting = true;

    let latestEntity;

    viewer.selectedEntityChanged.addEventListener((entity) => {
        showInfo(entity);
        if (entity) {
            if (latestEntity && latestEntity != entity) {
                latestEntity.label = undefined;
                latestEntity.polyline = undefined;
                latestEntity = entity;
            }
            latestEntity = entity;
            entity.label = {
                text: `${entity.name}\nID: ${entity.id}`,
                font: "12px Helvetica",
                fillColor: Cesium.Color.WHITE,
                style: Cesium.LabelStyle.FILL_AND_OUTLINE,
                showBackground: true,
            }
            let line = drawOrbit(satArr, entity.index, entity); //dragonlordslayer please find out how to get index of entity in satArr


        } else {
            latestEntity.label = undefined;
            latestEntity.polyline = undefined;
        }

    });

    return viewer;
}

function loadTimeline(timeline) {
    timeline.zoomTo(startTime, endTime)
    return timeline;
}

function loadPolyLines() {
    const polylines = new Cesium.PolylineCollection({ show: true });
    return polylines;
}

function addToViewer(satrec, viewer, orbArr, i) {
    let positionsOverTime = new Cesium.SampledPositionProperty();
    let satelliteEntity = {};

    for (let i = -totalSeconds; i < totalSeconds; i += timestepInSeconds) {
        const time = Cesium.JulianDate.addSeconds(start, i, new Cesium.JulianDate());
        const jsDate = Cesium.JulianDate.toDate(time);

        const positionAndVelocity = satellite.propagate(satrec, jsDate);
        if (Array.isArray(positionAndVelocity)) {
            break;
        }
        satelliteEntity.velocity = positionAndVelocity.velocity;
        const gmst = satellite.gstime(jsDate);
        const p = satellite.eciToGeodetic(positionAndVelocity.position, gmst);

        const position = Cesium.Cartesian3.fromRadians(p.longitude, p.latitude, p.height * 1000);
        positionsOverTime.addSample(time, position);
    }
    entityArr.push(positionsOverTime)

    let orbObj = orbArr[i];

    satelliteEntity.position = positionsOverTime;
    if (orbObj.OBJECT_TYPE == 'DEBRIS') {
        satelliteEntity.point = { pixelSize: 2, color: Cesium.Color.RED };
    } else if (orbObj.OBJECT_TYPE == 'PAYLOAD') {
        satelliteEntity.point = { pixelSize: 2, color: Cesium.Color.BLUE };
    } else {
        satelliteEntity.point = { pixelSize: 2, color: Cesium.Color.WHITE };
    }
    satelliteEntity.name = orbObj.OBJECT_NAME;
    satelliteEntity.index = i;
    satelliteEntity.objectType = orbObj.OBJECT_TYPE;
    satelliteEntity.id = orbObj.NORAD_CAT_ID;
    satelliteEntity.period = orbObj.PERIOD;
    satelliteEntity.inclination = orbObj.INCLINATION;
    satelliteEntity.eccentricity = orbObj.ECCENTRICITY;
    satelliteEntity.meanMotion = orbObj.MEAN_MOTION;
    satelliteEntity.semiMajorAxis = orbObj.SEMIMAJOR_AXIS;

    const satellitePoint = viewer.entities.add(satelliteEntity);
    return satellitePoint;
}

function drawOrbit(satArr, index, entity) {
    let type = entity.objectType;
    let color;
    if (type === "PAYLOAD") {
        color = Cesium.Color.BLUE
    } else if (type === 'ROCKET BODY') {
        color = Cesium.Color.WHITE;
    } else {
        color = Cesium.Color.RED;
    }

    let period = entity.period * 60;
    let positionArrSampled = [];
    let positionsOverTime = new Cesium.SampledPositionProperty()

    for (let i = -period; i < period; i += 10) {
        const time = Cesium.JulianDate.addSeconds(start, i, new Cesium.JulianDate());
        let pos = entity.position.getValue(time)
        if (typeof pos === 'undefined') {
            console.log(time);
            break;
        }

        positionArrSampled.push(pos)

    }
    console.log(positionArrSampled);


    return entity.polyline = {
        positions: positionArrSampled,
        loop: true,
        width: 1,
        material: color,
    }
}

async function listenForFilterChange(viewer) {
    let debris = document.getElementById('debris-select');
    let payload = document.getElementById('payload-select');
    let rocketBody = document.getElementById('rocket-body-select');

    debris.addEventListener('change', () => {
        updateCanvas(viewer, 'DEBRIS', debris.checked);
    })

    payload.addEventListener('change', () => {
        updateCanvas(viewer, 'PAYLOAD', payload.checked);
    })

    rocketBody.addEventListener('change', () => {
        updateCanvas(viewer, 'ROCKET BODY', rocketBody.checked);
    })
}

function updateCanvas(viewer, type, checked) {
    let entities = viewer.entities.values;
    for (let i = 0; i < entities.length; i++) {
        let entity = entities[i];
        if (entity.objectType == type) {
            entity.show = checked;
        }
    }
}

function showInfo(entity) {
    if (entity) {
        let panel = document.getElementById("right-panel")
        let { name, id, objectType, period, inclination, eccentricity, meanMotion, semiMajorAxis } = entity
        panel.innerHTML = `
        <h1> Entity Information </h1>
        <div class="info" id = "name"> Name: ${name}</div>
        <div class="info" id = "norad-id"> NORAD ID: ${id}</div>
        <div class="info" id = "type"> Type: ${objectType}</div>
        <div class="info" id = "period"> Period: ${period} min</div>
        <div class="info" id = "inclination"> Inclination: ${inclination} deg</div>
        <div class="info" id = "eccentricity"> Eccenctricity: ${eccentricity}</div>
        <div class="info" id = "mean-motion"> Mean Motion: ${meanMotion} rad/min</div>
        <div class="info" id = "semi-major-axis"> Semi-Major Axis: ${semiMajorAxis} m</div>`
        panel.style.display = "block";
    } else {
        document.getElementById("right-panel").style.display = "none";
    }
}

async function propogate() {
    const { satArr, orbArr } = await getData();

    let viewer = await loadViewer(satArr);

    let polylines = loadPolyLines();

    let timeline = await loadTimeline(viewer.timeline);

    for (let i = 0; i < satArr.length; i++) {
        addToViewer(satArr[i], viewer, orbArr, i);
    }

    await listenForFilterChange(viewer);

    return true;
}