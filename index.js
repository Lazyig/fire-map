window.$ = window.jQuery = require('jquery');
import dialogPolyfill from 'dialog-polyfill'
import 'ol/ol.css';
import { Map, View, Feature } from 'ol';
import Overlay from 'ol/Overlay';
import TileLayer from 'ol/layer/Tile';
import OSM from 'ol/source/OSM';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import { Heatmap as HeatmapLayer } from 'ol/layer';
import { fromLonLat } from 'ol/proj';
import Geolocation from 'ol/Geolocation';
import { Style, Circle as CircleStyle, Fill, Stroke, Icon } from 'ol/style';
import { defaults as defaultInteraction } from 'ol/interaction';
import { Point, Circle } from 'ol/geom';
import GeoJSON from 'ol/format/GeoJSON';


if (!Promise.prototype.finally) {
    Promise.prototype.finally = function(onfinally) {
        return this.then(onfinally, onfinally);
    }
}


$(document).ready(function() {
    const HOST = "";


    function tryParseJson(text) {
        try {
            return JSON.parse(text);
        }
        catch {
            return null;
        }
    }

    function formatTime(time) {
        let month = time.getMonth() + 1;
        if (month < 10) month = '0' + month;
        let day = time.getDate();
        if (day < 10) day = '0' + day;
        let hours = time.getHours();
        if (hours < 10) hours = '0' + hours;
        let mins = time.getMinutes();
        if (mins < 10) mins = '0' + mins;
        return `${month}. ${day}. ${hours}:${mins}`;
    }

    var domText = document.createTextNode('');
    var domNative = document.createElement('span');
    domNative.appendChild(domText);
    function escapeHtml(html) {
        domText.nodeValue = html;
        return domNative.innerHTML;
    }

    function showSnackbar(message, timeout = null, actionText = null, handler = null) {
        let snackbarContainer = document.querySelector('#snackbar');
        if (snackbarContainer && snackbarContainer.MaterialSnackbar) {
            var data = {
                message: message,
                timeout: timeout,
                actionHandler: handler,
                actionText: actionText
            };
            snackbarContainer.MaterialSnackbar.showSnackbar(data);
        }
        else {
            setTimeout(() => {
                showSnackbar(message, timeout, actionText, handler);
            }, 1000);
        }
    }

    var dlgLoading = document.getElementById("dlgLoading");
    if (!dlgLoading.showModal) {
        dialogPolyfill.registerDialog(dlgLoading);
    }
    function showLoadingDialog() {
        dlgLoading.showModal();
    }
    function closeLoadingDialog() {
        dlgLoading.close();
    }

    var dlgDelete = document.getElementById("dlgDelete");
    if (!dlgDelete.showModal) {
        dialogPolyfill.registerDialog(dlgDelete);
    }
    function showDeleteDialog() {
        dlgDelete.showModal();
    }
    function closeDeleteDialog() {
        dlgDelete.close();
    }

    var dlgBadReport = document.getElementById("dlgBadReport");
    if (!dlgBadReport.showModal) {
        dialogPolyfill.registerDialog(dlgBadReport);
    }
    function showBadReportDialog() {
        refreshBadCaptcha();

        dlgBadReport.showModal();
    }
    function closeBadReportDialog() {
        dlgBadReport.close();

        // Reset form.
        $("#txtBadReason").val("");
    }

    function getGpsPosition() {
        let geom = positionFeature.getGeometry();
        if (geom) {
            return geom.getCoordinates();
        }
        else {
            return null;
        }
    }

    function moveViewToGpsPosition() {
        let here = getGpsPosition();
        if (here) {
            map.getView().animate({
                center: here,
                zoom: 15,
                duration: 300,
            });
        }
    }

    var imgCaptcha = $("#imgCaptcha");
    function refreshReportCaptcha() {
        imgCaptcha.attr('src', `${HOST}/captcha?channel=1&${Date.now()}`);
        txtCaptcha.val("");
    }

    var imgBadCaptcha = $("#imgBadCaptcha");
    var txtBadCaptcha = $("#txtBadCaptcha");
    function refreshBadCaptcha() {
        imgBadCaptcha.attr('src', `${HOST}/captcha?channel=2&${Date.now()}`);
        txtBadCaptcha.val("");
    }

    function refreshReportMap() {
        return new Promise(function(resolve, reject) {
            var req = new XMLHttpRequest();
            req.onload = function() {
                let data = tryParseJson(req.response);

                if (!data || !data.reports) {
                    showSnackbar("제보 데이터를 가져올 수 없습니다.");
                    reject();
                    return;
                }

                reportSource.clear();

                let reports = data.reports;
                let lvlColors = ['#00b200', '#ffcd2e', '#fe871b', '#f41800', '#840300'];
                let time = new Date().getTime();

                for (let i = 0; i < reports.length; ++i) {
                    let report = reports[i];
                    if (report.lvl < 0 || report.lvl >= lvlColors.length) {
                        continue;
                    }
                    
                    // Calculate opacity.
                    let minOpacity = 50;
                    let opacity = 1 - (time - report.created_time * 1000) / (24 * 60 * 60 * 1000);
                    opacity = Math.round(opacity * (255 - minOpacity) + minOpacity);
                    opacity = Math.max(Math.min(opacity, 255), minOpacity);
                    opacity = opacity.toString(16);
                    if (opacity.length == 1) {
                        opacity = '0' + opacity;
                    }

                    let reportFeature = new Feature();
                    reportFeature.setId(report.id);
                    reportFeature.set('report', report);
                    reportFeature.setStyle(new Style({
                        image: new CircleStyle({
                            radius: (4 + report.lvl) * 2,
                            fill: new Fill({
                                color: lvlColors[report.lvl] + opacity,
                            })
                        }),
                        zIndex: report.lvl,
                    }));
                    reportFeature.setGeometry(new Point([report.longitude, report.latitude]));

                    reportSource.addFeature(reportFeature);
                }

                resolve();
            }
            req.onerror = function() {
                reject();
                showSnackbar("제보 데이터를 가져올 수 없습니다.");
            }

            req.open("GET", HOST + "/report-map", true);
            req.send();
        });
    }

    function refreshShelterMap() {
        return new Promise(function(resolve, reject) {
            var req = new XMLHttpRequest();
            req.onload = function() {
                let data = tryParseJson(req.response);

                if (!data || !data.shelters) {
                    showSnackbar("대피소 데이터를 가져올 수 없습니다.");
                    reject();
                    return;
                }

                shelterSource.clear();

                let shelters = data.shelters;

                for (let i = 0; i < shelters.length; ++i) {
                    let shelter = shelters[i];
                    let shelterFeature = new Feature();
                    shelterFeature.set('shelter', shelter);
                    shelterFeature.setGeometry(new Point(fromLonLat([shelter.longitude, shelter.latitude])));
                    shelterFeature.setStyle(new Style({
                        image: new Icon({
                            anchor: [0.5, 46],
                            anchorXUnits: 'fraction',
                            anchorYUnits: 'pixels',
                            src: 'shelter.png',
                        }),
                    }));

                    shelterSource.addFeature(shelterFeature);
                }

                resolve();
            }
            req.onerror = function() {
                reject();
                showSnackbar("대피소 데이터를 가져올 수 없습니다.");
            }

            req.open("GET", HOST + "/shelter-map", true);
            req.send();
        });
    }

    function refreshCctvMap() {
        return new Promise(function(resolve, reject) {
            var req = new XMLHttpRequest();
            req.onload = function() {
                let data = tryParseJson(req.response);

                if (!data || !data.cctvs) {
                    showSnackbar("CCTV 데이터를 가져올 수 없습니다.");
                    reject();
                    return;
                }

                cctvSource.clear();

                let cctvs = data.cctvs;

                for (let i = 0; i < cctvs.length; ++i) {
                    let tv = cctvs[i];
                    let tvFeature = new Feature();
                    tvFeature.set('cctv', tv);
                    tvFeature.setGeometry(new Point(fromLonLat([tv.longitude, tv.latitude])));
                    tvFeature.setStyle(new Style({
                        image: new Icon({
                            anchor: [0.5, 46],
                            anchorXUnits: 'fraction',
                            anchorYUnits: 'pixels',
                            src: 'cctv.png',
                        }),
                    }));

                    cctvSource.addFeature(tvFeature);
                }

                resolve();
            }
            req.onerror = function() {
                reject();
                showSnackbar("CCTV 데이터를 가져올 수 없습니다.");
            }

            req.open("GET", HOST + "/cctv-map", true);
            req.send();
        });
    }

    function refreshEventMap() {
        return new Promise(function(resolve, reject) {
            var req = new XMLHttpRequest();
            req.onload = function() {
                let data = tryParseJson(req.response);

                if (!data || !data.events) {
                    showSnackbar("산불 데이터를 가져올 수 없습니다.");
                    reject();
                    return;
                }

                eventSource.clear();

                let events = data.events;

                for (let i = 0; i < events.length; ++i) {
                    let evt = events[i];
                    let evtFeature = new Feature();
                    evtFeature.set('event', evt);
                    evtFeature.setGeometry(new Point(fromLonLat([evt.longitude, evt.latitude])));
                    evtFeature.setStyle(new Style({
                        image: new Icon({
                            anchor: [0.5, 0.5],
                            anchorXUnits: 'fraction',
                            anchorYUnits: 'fraction',
                            src: statusToIcon(evt.status),
                        }),
                    }));

                    eventSource.addFeature(evtFeature);
                }

                resolve();
            }
            req.onerror = function() {
                reject();
                showSnackbar("산불 데이터를 가져올 수 없습니다.");
            }

            req.open("GET", HOST + "/fire-event-map", true);
            req.send();
        });
    }

    function refreshFireMap() {
        return new Promise(function(resolve, reject) {
            var req = new XMLHttpRequest();
            req.onload = function() {
                let data = tryParseJson(req.response);

                if (!data || !data.fires) {
                    showSnackbar("화재 관측 데이터를 가져올 수 없습니다.");
                    reject();
                    return;
                }

                fireSource.clear();

                let fires = data.fires;

                let now = new Date();
                let maxHours = 48;
                let maxPower = 500;

                for (let i = 0; i < fires.length; ++i) {
                    let fire = fires[i];

                    let ageScale = 1 - Math.min((now - fire.time * 1000) / 1000 / 60 / 60 / maxHours, 1);
                    let weight = Math.min((fire.bright + fire.power) / maxPower * ageScale, 1);

                    let fireFeature = new Feature();
                    fireFeature.set('fire', fire);
                    fireFeature.set('weight', weight);
                    fireFeature.setGeometry(new Point(fromLonLat([fire.longitude, fire.latitude])));

                    fireSource.addFeature(fireFeature);
                }

                resolve();
            }
            req.onerror = function() {
                reject();
                showSnackbar("화재 관측 데이터를 가져올 수 없습니다.");
            }

            req.open("GET", HOST + "/active-fire-map", true);
            req.send();
        });
    }

    function refreshForecastMap() {
        return new Promise(function(resolve, reject) {
            if (forecastSource.getState() != 'ready') {
                showSnackbar("행정구역 데이터가 준비되지 않았습니다.");
                reject();
                return;
            }

            var req = new XMLHttpRequest();
            req.onload = function() {
                let data = tryParseJson(req.response);

                if (!data || !data.forecasts) {
                    showSnackbar("화재위험지수 데이터를 가져올 수 없습니다.");
                    reject();
                    return;
                }

                let forecasts = data.forecasts;

                let lvlToColor = ['#005ce6', '#ffdf00', '#ff7200', '#ff0000'];

                for (let i = 0; i < forecasts.length; ++i) {
                    let fire = forecasts[i];

                    let level = fire.lvl;
                    if (level < 51) {
                        level = 0;
                    }
                    else if (level < 66) {
                        level = 1;
                    }
                    else if (level < 86) {
                        level = 2;
                    }
                    else {
                        level = 3;
                    }

                    let feat = forecastSource.getFeatureById(fire.code);
                    feat.setStyle(new Style({
                        fill: new Fill({
                            color: lvlToColor[level],
                        }),
                    }));
                }

                resolve();
            }
            req.onerror = function() {
                reject();
                showSnackbar("화재위험지수 데이터를 가져올 수 없습니다.");
            }

            req.open("GET", HOST + "/fire-forecast-map", true);
            req.send();
        });
    }

    function levelToIcon(lvl) {
        const icons = ['mood', 'sentiment_dissatisfied', 'warning', 'whatshot', 'directions_run'];

        if (lvl >= 0 && lvl < icons.length) {
            return icons[lvl];
        }
        else {
            return 'bug_report';
        }
    }

    function levelToDescription(lvl) {
        const desc = [
            "안전 : 화재나 우려되는 현상이 없음.",
            "주의 : 화염, 화광이나 연기가 멀리 있음.",
            "경계 : 화염, 연기의 구체적인 형태 확인이 가능.",
            "심각 : 열기가 느껴지거나 불티가 날림.",
            "대피 : 대피령, 개인 판단으로 떠나야 하는 위치."
        ];

        if (lvl >= 0 && lvl < desc.length) {
            return desc[lvl];
        }
        else {
            return '';
        }
    }

    function statusToText(status) {
        const statusText = ["진화중", "진화완료", "산불외종료"];

        if (status >= 0 && status < statusText.length) {
            return statusText[status];
        }
        else {
            return '';
        }
    }
    
    function statusToIcon(status) {
        const icons = ["fire.png", "nofire.png", "clear.png"];

        if (status >= 0 && status < icons.length) {
            return icons[status];
        }
        else {
            return '';
        }
    }


    // Set fire warning image.
    $("#imgFireWarning").attr('src', HOST + "/fire-warning");


    const map = new Map({
        target: 'map-container',
        layers: [
            new TileLayer({
                source: new OSM()
            })
        ],
        view: new View({
            center: fromLonLat([127.931774, 36.453383]),
            zoom: 7,
        }),
        interactions: defaultInteraction({
            altShiftDragRotate: false,
            pinchRotate: false,
        }),
    });


    var geolocation = new Geolocation({
        trackingOptions: {
            enableHighAccuracy: true
        },
        projection: map.getView().getProjection()
    });

    // Circle geometry to show GPS accuracy.
    var accuracyFeature = new Feature();
    var firstLowAcc = true;
    function onGpsAccuracyChanged() {
        let acc = geolocation.getAccuracy();
        if (isNaN(acc)) {
            return;
        }

        if (acc < 20000) {
            accuracyFeature.setGeometry(geolocation.getAccuracyGeometry());
        }
        else {
            accuracyFeature.setGeometry(null);

            if (firstLowAcc) {
                firstLowAcc = false;
                let errKm = Math.round(acc / 1000);
                showSnackbar(`현재 위치와 ${errKm}km 이상 차이가 날 수 있습니다.`, 3000);
            }
        }
    }
    geolocation.on('change:accuracyGeometry', onGpsAccuracyChanged);

    // Point geometry to show GPS position.
    var positionFeature = new Feature();
    positionFeature.setStyle(new Style({
        image: new CircleStyle({
            radius: 6,
            fill: new Fill({
                color: '#3399CC'
            }),
            stroke: new Stroke({
                color: '#fff',
                width: 2
            })
        })
    }));

    // Track GPS position.
    var firstPosition = true;
    function onGpsPositionChanged() {
        var coordinates = geolocation.getPosition();
        if (coordinates) {
            positionFeature.setGeometry(new Point(coordinates));

            if (firstPosition) {
                firstPosition = false;
                moveViewToGpsPosition();
            }
        }
    }
    geolocation.on('change:position', onGpsPositionChanged);

    // GPS layer.
    var gpsLayer = new VectorLayer({
        source: new VectorSource({
            features: [accuracyFeature, positionFeature]
        }),
    });
    map.addLayer(gpsLayer);


    var posGpsFeature = new Feature({
        geometry: new Circle([0, 0], 2000),
        style: new Style({
            fill: new Fill({
                color: '#fff8'
            }),
            stroke: new Stroke({
                color: '#3399CC',
                width: 2
            }),
        }),
    });

    var posLayer = new VectorLayer({
        source: new VectorSource({
            features: [posGpsFeature]
        }),
        zIndex: 99,
        visible: false,
    });
    map.addLayer(posLayer);

    function startGpsPosing() {
        if (posLayer.getVisible()) {
            return;
        }

        let gpsPos = geolocation.getPosition();
        if (gpsPos) {
            geolocation.setTracking(false);

            gpsLayer.setVisible(false);

            posGpsFeature.getGeometry().setCenter(gpsPos);
            posLayer.setVisible(true);

            showSnackbar("영역 안에서 새 위치를 선택하세요.");

            // Move view to see the posing area.
            map.getView().animate({
                center: gpsPos,
                zoom: 13,
                duration: 300,
            });
        }
    }

    function cancelGpsPosing() {
        if (posLayer.getVisible()) {
            posLayer.setVisible(false);
        }
        gpsLayer.setVisible(true);
    }

    function finishGpsPosing(targetCoord) {
        if (posLayer.getVisible()) {
            posLayer.setVisible(false);

            positionFeature.setGeometry(new Point(targetCoord));
            accuracyFeature.setGeometry(null);
        }
        gpsLayer.setVisible(true);
    }


    var forecastSource = new VectorSource({
        format: new GeoJSON(),
        url: "TL_SCCO_SIG.json",
    });
    var forecastLayer = new VectorLayer({
        map: map,
        source: forecastSource,
        zIndex: 0,
        renderMode: 'image',
        style: new Style({
            fill: new Fill({
                color: '#fff0',
            }),
        }),
        opacity: 0.3,
    });

    // Init fire forecast sources.
    (function() {
        function onForecastSourceChanged() {
            if (forecastSource.getState() == 'ready') {
                forecastSource.un('change', onForecastSourceChanged);
            }
    
            let features = forecastSource.getFeatures();
            for (let i = 0; i < features.length; ++i) {
                let feat = features[i];
                feat.setId(feat.get('SIG_CD'));
            }
            
            refreshForecastMap();
        }

        forecastSource.on('change', onForecastSourceChanged);
    })();


    var reportSource = new VectorSource();
    var reportLayer = new VectorLayer({
        source: reportSource,
        zIndex: 2,
    });
    map.addLayer(reportLayer);


    var shelterSource = new VectorSource();
    var shelterLayer = new VectorLayer({
        source: shelterSource,
        zIndex: 4,
    });
    map.addLayer(shelterLayer);


    var cctvSource = new VectorSource();
    var cctvLayer = new VectorLayer({
        source: cctvSource,
        zIndex: 3,
    });
    map.addLayer(cctvLayer);


    var eventSource = new VectorSource();
    var eventLayer = new VectorLayer({
        source: eventSource,
        zIndex: 5,
    });
    map.addLayer(eventLayer);


    var fireSource = new VectorSource();
    var fireLayer = new HeatmapLayer({
        source: fireSource,
        zIndex: 1,
        blur: 16,
        radius: 16,
        opacity: 0.5,
        renderMode: 'image',
        weight: 'weight',
    })
    map.addLayer(fireLayer);


    var showShelter = true;
    var showCctv = true;
    var showWind = true;
    var showForecast = true;

    function updateVisibilityByZoom() {
        let needUpdate = false;
        let zoom = map.getView().getZoom();

        let visible = (showShelter && zoom > 13);
        if (shelterLayer.getVisible() != visible) {
            shelterLayer.setVisible(visible);
            needUpdate = true;
        }

        visible = (showCctv && zoom > 11);
        if (cctvLayer.getVisible() != visible) {
            cctvLayer.setVisible(visible);
            needUpdate = true;
        }

        visible = (showForecast && zoom < 11);
        if (forecastLayer.getVisible() != visible) {
            forecastLayer.setVisible(visible);
            needUpdate = true;
        }

        if (needUpdate) {
            map.updateSize();
        }
    }

    function updateWindScale() {
        let data = wind.windData;

        if (!data) {
            return;
        }

        let resolution = map.getView().getResolution();
        let scale = data.resolution / resolution;

        let position = map.getPixelFromCoordinate([data.offset_x, data.offset_y]);
        if (!position) {
            return;
        }
        position[1] -= data.height * scale;

        let offset = [
            Math.max(-position[0] / scale, 0),
            Math.max(-position[1] / scale, 0)
        ];

        wind.move(position[0], position[1]);
        wind.offset(offset[0], offset[1]);
        wind.zoom(scale);
        wind.reset();

        if (showWind && !hideWindTemp) {
            windCanvas.hidden = false;
        }
    }

    map.on('movestart', function() {
        windCanvas.hidden = true;
    });
    map.on('moveend', function() {
        updateWindScale();
        updateVisibilityByZoom();
    });


    let mapContainer = $("#map-container");
    let windCanvas = document.getElementById("windCanvas");
    windCanvas.width = mapContainer.width();
    windCanvas.height = mapContainer.height();
    
    const gl = windCanvas.getContext('webgl', {antialiasing: false});

    const wind = window.wind = new WindGL(gl);
    wind.numParticles = calcNumParticles();

    function calcNumParticles() {
        return Math.min(Math.floor(mapContainer.width() / 10 * mapContainer.height() / 10),
            3000);
    }

    function drawWind() {
        if (wind.windData && !windCanvas.hidden) {
            wind.draw();
        }
        requestAnimationFrame(drawWind);
    }
    drawWind();

    function updateWindCanvasSize() {
        windCanvas.width = mapContainer.width();
        windCanvas.height = mapContainer.height();
        wind.resize();

        wind.numParticles = calcNumParticles();
    }

    function refreshWind() {
        return new Promise(function(resolve, reject) {
            var req = new XMLHttpRequest();
            req.onload = function() {
                let data = tryParseJson(req.response);

                if (!data || !data.width) {
                    showSnackbar("바람 데이터를 가져올 수 없습니다.");
                    reject();
                    return;
                }

                let windData = data;
                const windImage = new Image();
                windData.image = windImage;
                windImage.src = HOST + "/wind-map?id=" + data.id;
                windImage.onload = function () {
                    wind.setWind(windData);
                    updateWindScale();
                };

                resolve();
            }
            req.onerror = function() {
                reject();
                showSnackbar("바람 데이터를 가져올 수 없습니다.");
            }

            req.open("GET", HOST + "/wind-map-metadata", true);
            req.send();
        });
    }


    // Get and Show data to map.
    showLoadingDialog();
    refreshReportMap()
        .then(() => refreshShelterMap())
        .then(() => refreshCctvMap())
        .then(() => refreshEventMap())
        .then(() => refreshWind())
        .then(() => refreshFireMap())
        .finally(closeLoadingDialog);


    $("#btnTrackLocation").on('click', function() {
        firstPosition = true;
        geolocation.setTracking(true);
        
        onGpsPositionChanged();
        onGpsAccuracyChanged();

        cancelGpsPosing();
    });
    $("#btnRefresh").on('click', function() {
        closeAllPopups();

        showLoadingDialog();
        refreshReportMap()
            .then(() => refreshEventMap())
            .then(() => refreshWind())
            .then(() => refreshFireMap())
            .then(() => refreshForecastMap())
            .finally(closeLoadingDialog);
    });


    var barLevel = $("#barLevel");
    var txtLevel = $("#txtLevel");
    var icoReportForm = $("#icoForm");

    function onChangeLevel() {
        txtLevel.text(levelToDescription(barLevel.val()));
        icoReportForm.text(levelToIcon(barLevel.val()));
    }
    onChangeLevel();

    barLevel.on('input', onChangeLevel);
    barLevel.on('change', onChangeLevel);


    var txtDesc = $("#txtDesc"),
        txtCaptcha = $("#txtCaptcha"),
        txtUserId = $("#txtUserId"),
        txtUserPwd = $("#txtUserPwd");


    var overlay = $("#overlay"),
        fab = $(".fab"),
        cancel = $("#cancel"),
        btnSubmit = $("#btnSubmit");
    
    // fab click
    fab.on('click', openFAB);
    overlay.on('click', closeFAB);
    cancel.on('click', closeFAB);
    btnSubmit.on('click', submitReport);

    function openFAB(event) {
        if (event) event.preventDefault();
        fab.addClass('active');
        overlay.addClass('dark-overlay');
        
        if (positionFeature.getGeometry()) {
            // Move view to GPS position.
            moveViewToGpsPosition();
        }
        else {
            // Track GPS position.
            geolocation.setTracking(true);
        }

        // Init form.
        icoReportForm.text(levelToIcon(barLevel.val()));
        refreshReportCaptcha();

        fab.off('click');
    }
    
    function closeFAB(event) {
        if (event) {
            event.preventDefault();
            event.stopImmediatePropagation();
        }
    
        fab.removeClass('active');
        overlay.removeClass('dark-overlay');

        fab.on('click', openFAB);
    }
    
    function submitReport(event) {
        // 데이터 검증
        let captchaText = txtCaptcha.val();
        let userId = txtUserId.val();
        let userPwd = txtUserPwd.val();

        if (captchaText.length == 0) {
            showSnackbar("자동입력 방지문자를 입력하세요.");
            return;
        }
        else if (userId.length < txtUserId.attr('minlength')) {
            showSnackbar("이름이 너무 짧습니다.");
            return;
        }
        else if (userId.length > txtUserId.attr('maxlength')) {
            showSnackbar("이름이 너무 깁니다.");
            return;
        }
        else if (userPwd.length < txtUserPwd.attr('minlength')) {
            showSnackbar("비밀번호가 너무 짧습니다.");
            return;
        }
        

        // Fill GPS data.
        let coords = getGpsPosition();
        if (!coords) {
            showSnackbar("GPS 위치를 찾을 수 없습니다.");
            return;
        }

        $("#txtLongitude").val(coords[0]);
        $("#txtLatitude").val(coords[1]);


        showLoadingDialog();

        // 제보 전송
        $.ajax({
            type: 'POST',
            url: HOST + "/report",
            data: $("#frmReport").serialize(),
            success: function(data, status, req) {
                closeLoadingDialog();

                if (status == 'success') {
                    closeFAB(event);
                    showSnackbar("제보되었습니다.");
                }
                else {
                    refreshReportCaptcha();
                    showSnackbar(data);
                }
            },
            error: function(xhr, options, err) {
                closeLoadingDialog();
                refreshReportCaptcha();

                if (xhr.responseText) {
                    showSnackbar("오류: " + xhr.responseText);
                }
                else {
                    showSnackbar("오류: " + err);
                }
            },
        });
    }


    var btnUpload = $("#btnUpload");
    var txtFile = $("#txtFile");

    btnUpload.on('change', (e) => {
        let files = e.target.files;

        if (!files || files.length == 0 || !files[0]) {
            return;
        }

        showLoadingDialog();

        var reader = new FileReader();
        reader.onload = function() {
            var req = new XMLHttpRequest();
            req.onload = function() {
                closeLoadingDialog();
                if (req.status == 200) {
                    txtFile.val(req.responseText);
                }
                else {
                    showSnackbar("업로드 실패.");
                }
            }
            req.onerror = function() {
                closeLoadingDialog();
                showSnackbar("업로드 실패.");
            }

            req.open("POST", HOST + "/upload-image", true);
            req.send(reader.result);
        }
        reader.onerror = function() {
            closeLoadingDialog();
            showSnackbar("파일을 읽을 수 없습니다.");
        }

        reader.readAsDataURL(files[0]);
    });


    $("#btnRefreshReportCaptcha").on('click', () => {
        refreshReportCaptcha();
    });


    var popupReport = document.getElementById("popupReport");
    var popupReportCloser = document.getElementById("popupReportCloser");
    var popupSelect = document.getElementById("popupSelect");
    var popupSelectCloser = document.getElementById("popupSelectCloser");
    var popupShelter = document.getElementById("popupShelter");
    var popupShelterCloser = document.getElementById("popupShelterCloser");
    var popupCctv = document.getElementById("popupCctv");
    var popupCctvCloser = document.getElementById("popupCctvCloser");
    var popupEvent = document.getElementById("popupEvent");
    var popupEventCloser = document.getElementById("popupEventCloser");
    var popupFire = document.getElementById("popupFire");
    var popupFireCloser = document.getElementById("popupFireCloser");
    var reportList = $("#reportList");

    var reportOverlay = new Overlay({
        element: popupReport,
        autoPan: true,
        autoPanAnimation: {
            duration: 250
        }
    });
    var selectOverlay = new Overlay({
        element: popupSelect,
        autoPan: true,
        autoPanAnimation: {
            duration: 250
        }
    });
    var shelterOverlay = new Overlay({
        element: popupShelter,
        autoPan: true,
        autoPanAnimation: {
            duration: 250
        }
    });
    var cctvOverlay = new Overlay({
        element: popupCctv,
        autoPan: true,
        autoPanAnimation: {
            duration: 250
        }
    });
    var eventOverlay = new Overlay({
        element: popupEvent,
        autoPan: true,
        autoPanAnimation: {
            duration: 250
        }
    });
    var fireOverlay = new Overlay({
        element: popupFire,
        autoPan: true,
        autoPanAnimation: {
            duration: 250
        }
    });

    function closeAllPopups() {
        closePopupReport();
        closePopupSelect();
        closePopupShelter();
        closePopupCctv();
        closePopupEvent();
        closePopupFire();
    }

    function closePopupReport() {
        reportOverlay.setPosition(undefined);
        popupReportCloser.blur();

        restoreWindVisibility();
    }

    function closePopupSelect() {
        selectOverlay.setPosition(undefined);
        popupSelectCloser.blur();
        
        restoreWindVisibility();
    }

    function closePopupShelter() {
        shelterOverlay.setPosition(undefined);
        popupShelterCloser.blur();
        
        restoreWindVisibility();
    }

    function closePopupCctv() {
        cctvOverlay.setPosition(undefined);
        popupCctvCloser.blur();
        
        restoreWindVisibility();
    }

    function closePopupEvent() {
        eventOverlay.setPosition(undefined);
        popupEventCloser.blur();
        
        restoreWindVisibility();
    }

    function closePopupFire() {
        fireOverlay.setPosition(undefined);
        popupFireCloser.blur();
        
        restoreWindVisibility();
    }

    popupReportCloser.onclick = function () {
        closePopupReport();
        return false;
    };
    popupSelectCloser.onclick = function () {
        closePopupSelect();
        return false;
    };
    popupShelterCloser.onclick = function () {
        closePopupShelter();
        return false;
    };
    popupCctvCloser.onclick = function () {
        closePopupCctv();
        return false;
    };
    popupEventCloser.onclick = function () {
        closePopupEvent();
        return false;
    };
    popupFireCloser.onclick = function () {
        closePopupFire();
        return false;
    };

    map.addOverlay(reportOverlay);
    map.addOverlay(selectOverlay);
    map.addOverlay(shelterOverlay);
    map.addOverlay(cctvOverlay);
    map.addOverlay(eventOverlay);
    map.addOverlay(fireOverlay);

    function showReportPopup(id, coords) {
        closeAllPopups();
        hideWindTemporarily();
        
        $("#txtReportIdDelete").val(id);
        $("#txtBadReportId").val(id);

        showLoadingDialog();

        var req = new XMLHttpRequest();
        req.onload = function() {
            let report = tryParseJson(req.response);

            if (!report) {
                closeLoadingDialog();
                showSnackbar("제보를 가져올 수 없습니다.");
                return;
            }

            $("#icoReport").text(levelToIcon(report.lvl));
            $("#txtReportTime").text(formatTime(new Date(report.created_time * 1000)));
            $("#txtReportName").text(report.user_id);

            if (report.img_path.length > 0) {
                $("#imgReport").show()
                    .attr('src', HOST + "/" + report.img_path);
            }
            else {
                $("#imgReport").hide();
            }

            if (report.description.length > 0) {
                $("#txtReportDesc").show()
                    .text(report.description);
            }
            else {
                $("#txtReportDesc").hide();
            }

            closeLoadingDialog();

            reportOverlay.setPosition(coords);
        }
        req.onerror = function() {
            closeLoadingDialog();
            showSnackbar("제보를 가져올 수 없습니다.");
        }

        req.open("GET", HOST + "/report?id=" + id, true);
        req.send();
    }

    function showSelectPopup(reports, coords) {
        closeAllPopups();
        hideWindTemporarily();

        let now = new Date().getTime();

        const itemMapper = (r) => {
            let time = formatTime(new Date(r.created_time * 1000));

            return `
            <li class="mdl-list__item mdl-list__item--two-line">
                <span class="mdl-list__item-primary-content">
                    <i class="material-icons mdl-list__item-avatar">${levelToIcon(r.lvl)}</i>
                    <span>${escapeHtml(r.user_id)}</span>
                    <span class="mdl-list__item-sub-title">${escapeHtml(time)}</span>
                </span>
                <span class="mdl-list__item-secondary-content">
                    <button report-id="${r.id}" class="mdl-button mdl-js-button mdl-button--icon mdl-button--colored">
                        <i class="material-icons">input</i>
                    </button>
                </span>
            </li>
            `;
        };

        reportList.html(reports.map(itemMapper).join(''));
        
        reportList.off('click', 'button');
        reportList.on('click', 'button', function(e) {
            showReportPopup(parseInt($(this).attr('report-id')), coords);
        });

        selectOverlay.setPosition(coords);
    }

    function showShelterPopup(shelter, coords) {
        closeAllPopups();
        hideWindTemporarily();

        $("#txtShelterName").text(shelter.name);
        $("#txtShelterInfo").text(`수용: ${shelter.capacity}명, 면적: ${shelter.area}㎡`);

        shelterOverlay.setPosition(coords);
    }

    function showCctvPopup(cctv, coords) {
        closeAllPopups();
        hideWindTemporarily();

        showLoadingDialog();

        var req = new XMLHttpRequest();
        req.onload = function() {
            let tv = tryParseJson(req.response);

            if (!tv) {
                closeLoadingDialog();
                showSnackbar("CCTV 정보를 가져올 수 없습니다.");
                return;
            }

            let title = tv.name;
            let info = "CCTV";

            let match = /^\[(.+?)\]\s*/g.exec(title);
            if (match !== null) {
                title = tv.name.slice(match[0].length);
                info = match[1];
            }

            $("#txtCctvName").text(title);
            $("#txtCctvInfo").text(info);
            $("#movCctv").attr('src', tv.url);

            closeLoadingDialog();

            cctvOverlay.setPosition(coords);
        }
        req.onerror = function() {
            closeLoadingDialog();
            showSnackbar("CCTV 정보를 가져올 수 없습니다.");
        }

        req.open("GET", HOST + "/cctv?name=" + encodeURIComponent(cctv.name), true);
        req.send();
    }

    function showEventPopup(event, coords) {
        closeAllPopups();
        hideWindTemporarily();

        let rawDate = event.date;
        let date = `${rawDate.substr(0, 4)}-${rawDate.substr(4, 2)}-${rawDate.substr(6, 2)}`;

        let rawTime = event.time;
        let time = `${rawTime.substr(0, 2)}:${rawTime.substr(2, 2)}:${rawTime.substr(4, 2)}`;

        $("#imgEventStatus").attr('src', HOST + "/" + statusToIcon(event.status));
        $("#txtEventStatus").text(statusToText(event.status));
        $("#txtEventTime").text(`${date} ${time}`);
        $("#txtEventAddress").text(event.address);

        eventOverlay.setPosition(coords);
    }

    function showFirePopup(fire, coords) {
        closeAllPopups();
        hideWindTemporarily();

        $("#txtFireTime").text(formatTime(new Date(fire.time * 1000)));
        $("#txtFireBright").text(`밝기 : ${fire.bright.toFixed(1)} K`);
        $("#txtFirePower").text(`방사량 : ${fire.power.toFixed(1)} MW`);

        fireOverlay.setPosition(coords);
    }

    map.on('singleclick', function (evt) {
        let coords = evt.coordinate;

        let gpsEndPosing = false;
        let gpsPosing = false;
        let reports = [];
        let shelter = null;
        let cctv = null;
        let fireEvt = null;
        let activeFire = null;

        map.forEachFeatureAtPixel(evt.pixel, function (feat, layer) {
            if (feat === posGpsFeature) {
                gpsEndPosing = true;
            }
            else if (feat === positionFeature) {
                gpsPosing = true;
            }
            else if (layer === reportLayer) {
                reports.push(feat);
            }
            else if (layer === shelterLayer) {
                shelter = feat;
            }
            else if (layer === cctvLayer) {
                cctv = feat;
            }
            else if (layer === eventLayer) {
                fireEvt = feat;
            }
            else if (layer === fireLayer) {
                if (activeFire === null
                    || activeFire.get('weight') < feat.get('weight')) {
                    activeFire = feat;
                }
            }
        });
        
        if (gpsEndPosing) {
            closeAllPopups();
            finishGpsPosing(coords);
        }
        else if (gpsPosing) {
            closeAllPopups();
            startGpsPosing();
        }
        else if (shelter !== null) {
            showShelterPopup(shelter.get('shelter'), shelter.getGeometry().getCoordinates());
        }
        else if (cctv !== null) {
            showCctvPopup(cctv.get('cctv'), cctv.getGeometry().getCoordinates());
        }
        else if (fireEvt !== null) {
            showEventPopup(fireEvt.get('event'), fireEvt.getGeometry().getCoordinates());
        }
        else if (reports.length >= 2) {
            showSelectPopup(reports.slice(0, 8).map((feat) => feat.get('report')), coords);
        }
        else if (reports.length == 1) {
            showReportPopup(reports[0].getId(), reports[0].getGeometry().getCoordinates())
        }
        else if (activeFire !== null) {
            showFirePopup(activeFire.get('fire'), activeFire.getGeometry().getCoordinates());
        }
        else {
            closeAllPopups();
            cancelGpsPosing();
        }
    });


    $("#btnDeleteReport").on('click', showDeleteDialog);
    $("#btnCloseDeleteDlg").on('click', closeDeleteDialog);
    $("#btnSubmitDeleteDlg").on('click', () => {
        showLoadingDialog();

        let payload = $("#frmDelete").serialize();

        var req = new XMLHttpRequest();
        req.onload = function() {
            closeLoadingDialog();
            if (req.status == 200) {
                closeDeleteDialog();
                closePopupReport();
                showSnackbar("삭제되었습니다.");
            }
            else if (req.responseText) {
                showSnackbar("오류: " + req.responseText);
            }
            else {
                showSnackbar("삭제 실패.");
            }
        }
        req.onerror = function() {
            closeLoadingDialog();
            if (req.responseText) {
                showSnackbar("오류: " + req.responseText);
            }
            else {
                showSnackbar("삭제 실패.");
            }
        }

        req.open("DELETE", HOST + "/report?" + payload, true);
        req.send();
    });

    $("#btnRefreshBadCaptcha").on('click', () => {
        refreshBadCaptcha();
    });
    $("#btnBadReport").on('click', showBadReportDialog);
    $("#btnCloseBadDlg").on('click', closeBadReportDialog);
    $("#btnSubmitBadDlg").on('click', () => {
        showLoadingDialog();

        $.ajax({
            type: 'POST',
            url: HOST + "/bad-report",
            data: $("#frmBadReport").serialize(),
            success: function(data, status, req) {
                closeLoadingDialog();

                if (status == 'success') {
                    closeBadReportDialog(event);
                    showSnackbar("신고되었습니다.");
                }
                else {
                    refreshBadCaptcha();
                    showSnackbar(data);
                }
            },
            error: function(xhr, options, err) {
                closeLoadingDialog();
                refreshBadCaptcha();

                if (xhr.responseText) {
                    showSnackbar("오류: " + xhr.responseText);
                }
                else {
                    showSnackbar("오류: " + err);
                }
            },
        });
    });


    // Menu
    $("#menuToggleShelter").on('click', () => {
        showShelter = !showShelter;
        updateVisibilityByZoom();

        if (!showShelter) {
            closePopupShelter();
        }
    })
    $("#menuToggleCctv").on('click', () => {
        showCctv = !showCctv;
        updateVisibilityByZoom();

        if (!showCctv) {
            closePopupCctv();
        }
    })
    $("#menuToggleWind").on('click', () => {
        windCanvas.hidden = showWind;
        showWind = !showWind;
    });
    $("#menuToggleForecast").on('click', () => {
        showForecast = !showForecast;
        updateVisibilityByZoom();
    });

    var hideWindTemp = false;
    function hideWindTemporarily() {
        windCanvas.hidden = true;
        hideWindTemp = true;
    }

    function restoreWindVisibility() {
        windCanvas.hidden = !showWind;
        hideWindTemp = false;
    }

    
    // Adjust map again.
    map.updateSize();


    function whenUpdateSize() {
        updateWindCanvasSize()

        let width = $(document).width();
    
        if (width < 360) {
            $("#txtAppTitle").text("Maps");
        }
        else {
            $("#txtAppTitle").text("Fire Maps");
        }
    }
    whenUpdateSize();
    
    $(window).resize(whenUpdateSize);
});
