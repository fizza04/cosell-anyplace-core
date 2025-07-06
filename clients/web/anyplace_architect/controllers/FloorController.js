/**
 *
 The MIT License (MIT)

 Copyright (c) 2015, Kyriakos Georgiou, Marileni Angelidou, Data Management Systems Laboratory (DMSu
 Department of Computer Science, University of Cyprus, Nicosia, CYPRUS,
 dmsl@cs.ucy.ac.cy, http://dmsl.cs.ucy.ac.cy/

 Permission is hereby granted, free of charge, to any person obtaining a copy
 of this software and associated documentation files (the "Software"), to deal
 in the Software without restriction, including without limitation the rights
 to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 copies of the Software, and to permit persons to whom the Software is
 furnished to do so, subject to the following conditions:

 The above copyright notice and this permission notice shall be included in
 all copies or substantial portions of the Software.

 THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 THE SOFTWARE.
 */

var changedfloor = false;

app.controller('FloorController',
    ['$scope', 'AnyplaceService', 'GMapService', 'AnyplaceAPIService',
        function ($scope, AnyplaceService, GMapService, AnyplaceAPIService) {
    $scope.anyService = AnyplaceService;
    $scope.anyAPI = AnyplaceAPIService;
    $scope.gmapService = GMapService;
    $scope.xFloors = [];
    $scope.myFloors = {};
    $scope.myFloorId = 0;
    $scope.newFloorNumber = 0;
    $scope.isUploadingFloorplan = false;

    var heatmap;
    $scope.crudTabSelected = 1;
    $scope.setCrudTabSelected = function (n) { $scope.crudTabSelected = n; };
    $scope.isCrudTabSelected = function (n) { return $scope.crudTabSelected === n; };

    $scope.data = {
        floor_plan_coords: {},
        floor_plan_base64_data: {},
        floor_plan_groundOverlay: null,
        floorPlanPrevOverlay: null,
    };

    $scope.$on("loggedOff", function (event, mass) { _clearFloors(); });
    var _clearFloors = function () {
        $scope.removeFloorPlan();
        $scope.xFloors = [];
        $scope.myFloorId = 0;
        $scope.myFloors = {};
    };

    var _latLngFromPoi = function (p) {
        if (p && p.coordinates_lat && p.coordinates_lon) {
            return {lat: parseFloat(p.coordinates_lat), lng: parseFloat(p.coordinates_lon)}
        }
        return undefined;
    };

    $scope.$watch('anyService.selectedBuilding', function (newVal, oldVal) {
        if (newVal) {
            changedfloor = false;
            $scope.fetchAllFloorsForBuilding(newVal);
        }
    });

    //  $scope.$watch('anyService.selectedPoi', function (newVal, oldVal) {
    //     if (newVal && _latLngFromPoi(newVal)) {
    //         $scope.showRadioHeatmapPoi();
    //     }
    // });
    // $scope.$watch('newFloorNumber', function (newVal, oldVal) {
    //     if (_floorNoExists(newVal)) {
    //        _setNextFloor();
    //     }
    // });

    var _latLngFromBuilding = function (b) {
        if (b && b.coordinates_lat && b.coordinates_lon) {
            return {
                lat: parseFloat(b.coordinates_lat),
                lng: parseFloat(b.coordinates_lon)
            }
        }
        return undefined;
    };

    $scope.$watch('anyService.selectedFloor', function (newVal, oldVal) {
        if (!$scope.isUploadingFloorplan) { // if we are still uploading a floorplan, the refresh will fail.
            if (newVal !== undefined && newVal !== null && !_.isEqual(newVal, oldVal)) {
                $scope.fetchFloorPlanOverlay(newVal);
                changedfloor = false;
            }
        }
    });

    $scope.fetchAllFloorsForBuilding = function (b) {
        var jsonReq = AnyplaceService.jsonReq;
        jsonReq.buid = b.buid;
        var promise = AnyplaceAPIService.allBuildingFloors(jsonReq);
        promise.then(
            function (resp) {
                $scope.xFloors = resp.data.floors;
                $scope.xFloors = $scope.xFloors.sort(function (a, b) {
                    return parseInt(a.floor_number) - parseInt(b.floor_number)
                });

                $scope.anyService.availableFloors = [];
                $scope.anyService.availableFloors = $scope.xFloors;

                // give priority to floor in url parameter - if exists
                if ($scope.urlFloor) {
                    for (var k = 0; k < $scope.xFloors.length; k++) {
                        if ($scope.urlFloor == $scope.xFloors[k].floor_number) {
                            $scope.anyService.selectedFloor = $scope.xFloors[k];
                            return;
                        }
                    }
                }

                // Set default selected
                if (typeof(Storage) !== "undefined" && localStorage && !LPUtils.isNullOrUndefined(localStorage.getItem('lastBuilding')) && !LPUtils.isNullOrUndefined(localStorage.getItem('lastFloor'))) {
                    for (var i = 0; i < $scope.xFloors.length; i++) {
                        if (String($scope.xFloors[i].floor_number) === String(localStorage.getItem('lastFloor'))) {
                            $scope.anyService.selectedFloor = $scope.xFloors[i];
                            return;
                        }
                    }
                }

                // Set default the first floor if selected floor
                if ($scope.xFloors && $scope.xFloors.length > 0) {
                    $scope.anyService.selectedFloor = $scope.xFloors[0];
                } else {
                    $scope.anyService.selectedFloor = undefined;
                }
                _setNextFloor();
            },
            function (resp) {
              ShowError($scope, resp, ERR_FETCH_ALL_FLOORS, true);
            }
        );
    };

    var _setNextFloor = function () {
        var max = -1;
        for (var i = 0; i < $scope.xFloors.length; i++) {
            if (parseInt($scope.xFloors[i].floor_number) >= max) {
                max = parseInt($scope.xFloors[i].floor_number);
            }
        }
        $scope.newFloorNumber = max + 1;
    };

    var _isValidFloorNumber = function (fl) {
        if (fl === null || fl == undefined) { return false; }

        if (fl.floor_number === null || fl.floor_number === undefined) { return false; }

        return true;
    };

    $scope.fetchFloorPlanOverlay = function () {
        if (!_isValidFloorNumber(this.anyService.selectedFloor)) {
            _warn_autohide($scope, 'Something is wrong with the floor');
            return;
        }

        var floor_number = this.anyService.selectedFloor.floor_number;
        var space = this.anyService.selectedBuilding;
        var buid = space.buid;
        var promise = AnyplaceAPIService.downloadFloorPlan(this.anyService.jsonReq, buid, floor_number);
        promise.then(
            function (resp) { // on success
                LOG.D3("fetched floorplan overlay")
                var data = resp.data;
                $scope.data.floor_plan_file = null;
                $scope.data.floor_plan = null;

                // hide this and the previous overlay
                if ($scope.data.floor_plan_groundOverlay != null) {
                    $scope.data.floor_plan_groundOverlay.setMap(null);
                    $scope.data.floor_plan_groundOverlay = null;
                    // hide the previous of the last overlay (showing the previous only on upload)
                    if ($scope.data.floorPlanPrevOverlay) {
                        LOG.D3("hiding previous");
                        $scope.data.floorPlanPrevOverlay.setMap(null);
                        $scope.data.floorPlanPrevOverlay = null;
                    }
                }

                // load the correct coordinates from the selected floor
                var fl = $scope.anyService.selectedFloor;
                var imageBounds = new google.maps.LatLngBounds(
                    new google.maps.LatLng(fl.bottom_left_lat, fl.bottom_left_lng),
                    new google.maps.LatLng(fl.top_right_lat, fl.top_right_lng));

                $scope.data.floorPlanPrevOverlay = $scope.data.floor_plan_groundOverlay;
                $scope.data.floor_plan_groundOverlay =
                    new USGSOverlay(imageBounds, "data:image/png;base64," + data, GMapService.gmap);

                // INFO do not pan to location
                // GMapService.gmap.panTo(_latLngFromBuilding($scope.anyService.selectedBuilding));
                // if (GMapService.gmap.getZoom() < 19) { GMapService.gmap.setZoom(19); }
                if (typeof(Storage) !== "undefined" && localStorage) {
                    localStorage.setItem("lastFloor", floor_number);
                }
            },
            function (resp) {
              ShowWarningAutohide($scope, resp, "Can't download floorplan");
            }
        );
    };

    var canvasOverlay = null;
    $scope.isCanvasOverlayActive = false;
    var floorPlanInputElement = $('#input-floor-plan');

    floorPlanInputElement.change(function handleImage(e) {
        var reader = new FileReader();
        reader.onload = function (event) {
            var imgObj = new Image();
            imgObj.src = reader.result;

            imgObj.onload = function () {
                canvasOverlay = new CanvasOverlay(imgObj, GMapService.gmap, $scope);
                GMapService.gmap.panTo(_latLngFromBuilding($scope.anyService.selectedBuilding));
                GMapService.gmap.setZoom(19);
                $scope.$apply($scope.isCanvasOverlayActive = true);

                if ($scope.data.floor_plan_groundOverlay != null
                    && $scope.data.floor_plan_groundOverlay.getMap()) {
                    var overlayMode = $('#overlay-mode').prop("checked");
                    if (!overlayMode) { // hide the last overlay
                        $scope.data.floor_plan_groundOverlay.setMap(null);
                        $scope.data.floor_plan_groundOverlay = null;
                    } else {
                        // hide the previous of the last overlay (maximum overlay history: 1)
                        if ($scope.data.floorPlanPrevOverlay) {
                            LOG.D3("hiding previous (on new image upload)");
                            $scope.data.floorPlanPrevOverlay.setMap(null);
                            $scope.data.floorPlanPrevOverlay = null;
                        }
                        $scope.data.floorPlanPrevOverlay = $scope.data.floor_plan_groundOverlay;
                        $scope.data.floor_plan_groundOverlay = null;
                    }
                }
            }
        };
        reader.readAsDataURL(e.target.files[0]);
        this.disabled = true;
    });

    $scope.setFloorPlan = function () {
      if (!canvasOverlay) { return; }

      if (GMapService.gmap.getZoom() < 18) {
            _warn_autohide($scope, "Minimum zoom level: 18. (current: " + GMapService.gmap.getZoom() + ")");
            return;
        }

        if (AnyplaceService.getBuildingId() === null || AnyplaceService.getBuildingId() === undefined) {
            console.log('building is undefined');
            _err($scope, "Something went wrong. Have you selected a building?");
            return
        }

        var newFl = {
            is_published: 'true',
            buid: String(AnyplaceService.getBuildingId()),
            floor_name: String($scope.newFloorNumber),
            description: String($scope.newFloorNumber),
            floor_number: String($scope.newFloorNumber)
        };

        $scope.myFloors[$scope.myFloorId] = newFl;
        $scope.myFloorId++;

        // create the proper image inside the canvas
        canvasOverlay.drawBoundingCanvas();
        // create the ground overlay and destroy the canvasOverlay object
        // and also set the floor_plan_coords in $scope.data
        var bl = canvasOverlay.bottom_left_coords;
        var tr = canvasOverlay.top_right_coords;
        $scope.data.floor_plan_coords.bottom_left_lat = bl.lat();
        $scope.data.floor_plan_coords.bottom_left_lng = bl.lng();
        $scope.data.floor_plan_coords.top_right_lat = tr.lat();
        $scope.data.floor_plan_coords.top_right_lng = tr.lng();
        $scope.data.floor_plan_coords.zoom = GMapService.gmap.getZoom() + "";
        var data = canvasOverlay.getCanvas().toDataURL("image/png"); // defaults to png

        $scope.data.floor_plan_base64_data = data;
        var imageBounds = new google.maps.LatLngBounds(
            new google.maps.LatLng(bl.lat(), bl.lng()),
            new google.maps.LatLng(tr.lat(), tr.lng()));
        $scope.data.floor_plan_groundOverlay = new USGSOverlay(imageBounds, data, GMapService.gmap);

        canvasOverlay.setMap(null); // remove the canvas overlay since the groundoverlay is placed
        $('#input-floor-plan').prop('disabled', false);
        $scope.isCanvasOverlayActive = false;

        if (_floorNoExists($scope.newFloorNumber)) {  // This if is never true (?) CHECK
            for (var i = 0; i < $scope.xFloors.length; i++) {
                var f = $scope.xFloors[i];
                if (!LPUtils.isNullOrUndefined(f)) {
                    if (f.floor_number === String($scope.newFloorNumber)) {
                        LOG.D3("setFloorPlan: uploadWithZoom: data: " + $scope.data.size)
                        $scope.uploadWithZoom($scope.anyService.selectedBuilding, f, $scope.data);
                        break;
                    }
                }
            }
        } else {
            LOG.D3("setFloorPlan: addFloorObject")
            $scope.addFloorObject(newFl, $scope.anyService.selectedBuilding, $scope.data);
        }
    };

    var _checkFloorFormat = function (bobj) {
        if (bobj === null) bobj = {}
        else bobj = JSON.parse(JSON.stringify(bobj))

        if (LPUtils.isNullOrUndefined(bobj.buid)) { bobj.buid = "" }
        if (LPUtils.isNullOrUndefined(bobj.floor_name)) { bobj.floor_name = "" }
        if (LPUtils.isNullOrUndefined(bobj.floor_number)) { bobj.floor_number = "" }
        if (LPUtils.isNullOrUndefined(bobj.description)) { bobj.description = "" }
        if (LPUtils.isNullOrUndefined(bobj.is_published)) { bobj.is_published = 'true' }
        return bobj;
    };

    /**
     * Creates a Floor entry before uploading with the zoom. That is two API calls.
     *
     * @param flJson
     * @param selectedBuilding
     * @param flData
     */
    $scope.addFloorObject = function (flJson, selectedBuilding, flData) {
        LOG.D("addFloorObject:")
        var obj = _checkFloorFormat(flJson);
        var promise = $scope.anyAPI.addFloor(obj); // make the request at AnyplaceAPI
        promise.then(
            function (resp) { // on success
                var data = resp.data;
                // insert the newly created building inside the loadedBuildings
                $scope.xFloors.push(obj);
                LOG.D2("Created floor.");
                $scope.uploadWithZoom(selectedBuilding, obj, flData);
                $scope.anyService.selectedFloor = $scope.xFloors[$scope.xFloors.length - 1];
            },
            function (resp) {
              ShowError($scope, resp, "Could not create floor.", true);
            }
        );

    };

    $scope.removeFloorPlan = function () {
        $scope.data.floor_plan_file = null;
        $scope.data.floor_plan = null;

        if (canvasOverlay) { canvasOverlay.setMap(null); }
        if ($scope.data.floor_plan_groundOverlay) { $scope.data.floor_plan_groundOverlay.setMap(null); }

        var x = $('#input-floor-plan');
        x.replaceWith(x = x.clone(true));
        x.prop('disabled', false);
        $scope.isCanvasOverlayActive = false;
    };

    $scope.deleteFloor = function () {
        var bobj = $scope.anyService.getFloor();
        if (LPUtils.isNullOrUndefined(bobj)
            || LPUtils.isStringBlankNullUndefined(bobj.floor_number)
            || LPUtils.isStringBlankNullUndefined(bobj.buid)) {
            _err($scope, "No floor seems to be selected.");
            return;
        }
        var promise = $scope.anyAPI.deleteFloor(bobj); // make the request at AnyplaceAPI
        promise.then(
            function (resp) {
                // on success
                var data = resp.data;
                // delete the building from the loadedBuildings
                var lf = $scope.xFloors;
                var sz = lf.length;
                for (var i = 0; i < sz; i++) {
                    if (lf[i].floor_number == bobj.floor_number) {
                        lf.splice(i, 1);
                        break;
                    }
                }
                if ($scope.data.floor_plan_groundOverlay != null) {
                    $scope.data.floor_plan_groundOverlay.setMap(null);
                    $scope.data.floor_plan_groundOverlay = null;
                }
                if ($scope.xFloors && $scope.xFloors.length > 0) {
                    $scope.anyService.selectedFloor = $scope.xFloors[0];
                } else {
                    $scope.anyService.selectedFloor = undefined;
                }
                _suc($scope, "Floor deleted.");
            },
            function (resp) {
              ShowError($scope, resp, "Something went wrong while deleting the floor.", true);
            }
        );
    };

    var _floorNoExists = function (n) {
        for (var i = 0; i < $scope.xFloors.length; i++) {
            var f = $scope.xFloors[i];

            if (!LPUtils.isNullOrUndefined(f)) {
                if (f.floor_number === String(n)) {
                    return true;
                }
            }
        }
        return false;
    };

    var _cloneCoords = function (obj) {
        if (LPUtils.isNullOrUndefined(obj)) { return {} }
        var n = JSON.parse(JSON.stringify(obj));
        return n;
    };

    $scope.uploadWithZoom = function (sb, sf, flData) {
        LOG.D3("uploadWithZoom")
        if (LPUtils.isNullOrUndefined(canvasOverlay)) { return; }

        var bobj = _cloneCoords(flData.floor_plan_coords);
        if (LPUtils.isNullOrUndefined(bobj) || LPUtils.isStringBlankNullUndefined(bobj.bottom_left_lat)
            || LPUtils.isStringBlankNullUndefined(bobj.bottom_left_lng)
            || LPUtils.isStringBlankNullUndefined(bobj.top_right_lat)
            || LPUtils.isStringBlankNullUndefined(bobj.top_right_lng)) {

            LOG.E('error with floor coords');
            _err($scope, "No valid coordinates for this floorplan.");
            return;
        }

        bobj.bottom_left_lat = String(bobj.bottom_left_lat);
        bobj.bottom_left_lng = String(bobj.bottom_left_lng);
        bobj.top_right_lat = String(bobj.top_right_lat);
        bobj.top_right_lng = String(bobj.top_right_lng);

        sf.bottom_left_lat = bobj.bottom_left_lat;
        sf.bottom_left_lng = bobj.bottom_left_lng;
        sf.top_right_lat = bobj.top_right_lat;
        sf.top_right_lng = bobj.top_right_lng;

        if (!LPUtils.isNullOrUndefined(sb)) {
            if (!LPUtils.isNullOrUndefined(sb.buid)) {
                bobj.buid = sb.buid;
            } else {
                _err($scope, "Something wrong with the space id.");
                return;
            }
        } else {  // no building selected
            _err($scope, "No space selected.");
            return;
        }

        if (!LPUtils.isNullOrUndefined(sf)) {
            if (!LPUtils.isNullOrUndefined(sf.floor_number)) {
                bobj.floor_number = sf.floor_number;
            } else {
                _err($scope, "No number associated with the selected floor.");
                return;
            }
        } else {  // no floor selected
            _err($scope, "No floor selected.");
            return;
        }

        bobj.owner_id = $scope.owner_id;
        var json_req = JSON.stringify(bobj);
        if (LPUtils.isNullOrUndefined(flData.floor_plan_base64_data)
            || LPUtils.isStringEmptyNullUndefined(flData.floor_plan_base64_data)) {
            LOG.E('No floor plan file');
            return;
        }

        $scope.isUploadingFloorplan=true;
        _info($scope, "Uploading and processing floorplan ...");
        var promise = $scope.anyAPI.uploadFloorPlan64(json_req, $scope.data.floor_plan_base64_data);

        promise.then(
            function (resp) { // on success
                $scope.isUploadingFloorplan=false;
                _suc("Floorplan uploaded and tiled.");
                $scope.fetchFloorPlanOverlay(sf.floor_number);
            },
            function (resp) { // on error
                $scope.isUploadingFloorplan=false;
                ShowError($scope, resp, "Upload error", true);
            }); // on error
    };

    $scope.showRadioHeatmapPoi = function () {
        var jsonReq = {
            "buid": $scope.anyService.getBuildingId(),
            "floor": $scope.anyService.getFloorNumber(),
            "coordinates_lat": $scope.anyService.selectedPoi.coordinates_lat,
            "coordinates_lon": $scope.anyService.selectedPoi.coordinates_lon,
            "range": "1"
        };

        var promise = $scope.anyAPI.getRadioHeatmapPoi(jsonReq);
        promise.then(
            function (resp) {
                // on success
                var data = resp.data;
                var heatMapData = [];
                var i = resp.data.radioPoints.length;

                if (i <= 0) {
                    _err($scope, "Floor not mapped. Use logger (Google Play) to map it.");
                    return;
                }

                while (i--) {
                    var rp = resp.data.radioPoints[i];
                    heatMapData.push( {location: new google.maps.LatLng(rp.x, rp.y), weight: 1} );
                    resp.data.radioPoints.splice(i, 1);
                }

                if (heatmap && heatmap.getMap()) { heatmap.setMap(null); }
                heatmap = new google.maps.visualization.HeatmapLayer({ data: heatMapData });
                heatmap.setMap($scope.gmapService.gmap);
            },
            function (resp) {
                ShowWarningAutohide($scope, resp, "", false);
            }
        );
    }
}
]);
