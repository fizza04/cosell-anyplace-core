CanvasOverlay.prototype = new google.maps.OverlayView();

// https://github.com/wbyoko/angularjs-google-maps-components

/** @constructor */
function CanvasOverlay(image, map, angularScope) {
    this.angularScope=angularScope;
    this.top = 0;
    this.left = 0;

    this.FullWidth = image.width;
    this.FullHeight = image.height;

    this.width = image.width;
    this.height = image.height;

    // INFO this makes the image quality horrendous.
    // The solution should have used scale instead of resizing.
    // In any case, as a workaround, the getCanvas method builds a new HTML5 canvas
    // with full image quality.
    while (window && (this.width > window.innerWidth || this.height > window.innerHeight)) {
        this.width /= 2;
        this.height /= 2;
    }

    this.image_ = image;
    this.map_ = map;

    // We define a property to hold the canvas's div.
    // We'll actually create this div upon receipt of
    // the add() method so we'll leave it null for now.
    this.div_ = null;
    this.canvas = null;
    this.ctx = null;
    this.angle = 0;
    this.scale = 1;

    this.latlng = map.getCenter();

    // Explicitly call setMap on this overlay
    this.setMap(map);
    LOG.D3("Centering map to: " + this.latlng)
}

CanvasOverlay.prototype.onAdd = function () {
    // Note: an overlay's receipt of add() indicates that
    // the map's panes are now available for attaching
    // the overlay to the map via the DOM.

    // Create the DIV and set some basic attributes.
    var div = document.createElement('div');
    div.id = "canvas_editor";
    div.style.border = 'none';
    div.style.borderWidth = '0px';
    div.style.position = 'relative';
    div.style.top = this.top;
    div.style.left = this.left;

    // initialize the position of the outer div according to the center of the overlay
    // which is the center of the map
    var projection;
    if ((projection = this.getProjection()) != null) {
        var xy = projection.fromLatLngToDivPixel(this.latlng);
        div.style.top = (xy.y - this.height / 2) + 'px';
        div.style.left = (xy.x - this.width / 2) + 'px';
    }

    var self = this;

   // https://github.com/unlocomqx/jQuery-ui-resizable-rotation-patch/blob/master/resizable-rotation.patch.js
   // fixes problems in resizing rotated image
    function n(e) {
        return parseInt(e, 10) || 0
    }

    //patch: based on: andyzee
    //patch: https://github.com/andyzee/jquery-resizable-rotation-patch/blob/master/resizable-rotation.patch.js
    //patch: start of patch
    /**
     * Calculate the size correction for resized rotated element
     * @param {Number} init_w
     * @param {Number} init_h
     * @param {Number} delta_w
     * @param {Number} delta_h
     * @param {Number} angle in degrees
     * @returns {object} correction css object {left, top}
     */
    jQuery.getCorrection = function(init_w, init_h, delta_w, delta_h, angle){
        var angle = angle * Math.PI / 180  //Convert angle from degrees to radians

        //Get position after rotation with original size
        var x = -init_w/2;
        var y = init_h/2;
        var new_x = y * Math.sin(angle) + x * Math.cos(angle);
        var new_y = y * Math.cos(angle) - x * Math.sin(angle);
        var diff1 = {left: new_x - x, top: new_y - y};

        var new_width = init_w + delta_w;
        var new_height = init_h + delta_h;

        //Get position after rotation with new size
        var x = -new_width/2;
        var y = new_height/2;
        var new_x = y * Math.sin(angle) + x * Math.cos(angle);
        var new_y = y * Math.cos(angle) - x * Math.sin(angle);
        var diff2 = {left: new_x - x, top: new_y - y};

        //Get the difference between the two positions
        var offset = {left: diff2.left - diff1.left, top: diff2.top - diff1.top};
        return offset;
    }

    jQuery.ui.resizable.prototype._mouseStart = function(event) {
        var curleft, curtop, cursor,
            o = this.options,
            el = this.element;

        this.resizing = true;
        this._renderProxy();
        curleft = n(this.helper.css("left"));
        curtop = n(this.helper.css("top"));

        if (o.containment) {
            curleft += $(o.containment).scrollLeft() || 0;
            curtop += $(o.containment).scrollTop() || 0;
        }

        this.offset = this.helper.offset();
        this.position = { left: curleft, top: curtop };

        this.size = this._helper ? {
            width: this.helper.width(),
            height: this.helper.height()
        } : {
            width: el.width(),
            height: el.height()
        };

        this.originalSize = this._helper ? {
            width: el.outerWidth(),
            height: el.outerHeight()
        } : {
            width: el.width(),
            height: el.height()
        };

        this.sizeDiff = {
            width: el.outerWidth() - el.width(),
            height: el.outerHeight() - el.height()
        };

        this.originalPosition = { left: curleft, top: curtop };
        this.originalMousePosition = { left: event.pageX, top: event.pageY };

        //patch: object to store previous data
        this.lastData = this.originalPosition;

        this.aspectRatio = (typeof o.aspectRatio === "number") ?
            o.aspectRatio : ((this.originalSize.width / this.originalSize.height) || 1);

        cursor = $(".ui-resizable-" + this.axis).css("cursor");
        $("body").css("cursor", cursor === "auto" ? this.axis + "-resize" : cursor);
        el.addClass("ui-resizable-resizing");
        this._propagate("start", event);
        return true;
    };

    jQuery.ui.resizable.prototype._mouseDrag = function(event) {
        var alwaysRespectAspectRatio = true // force to always respect image ratio

        // patch: get the angle
        var angle = getAngle(this.element[0]);
        var angle_rad = angle * Math.PI / 180;
        var isShiftHold = event.shiftKey
        if (alwaysRespectAspectRatio) isShiftHold = true

        var data,
            el = this.helper, props = {},
            smp = this.originalMousePosition,
            a = this.axis,
            prevTop = this.position.top,
            prevLeft = this.position.left,
            prevWidth = this.size.width,
            prevHeight = this.size.height,
            dx = (event.pageX-smp.left)||0,
            dy = (event.pageY-smp.top)||0,
            trigger = this._change[a];

        var init_w = this.size.width;
        var init_h = this.size.height;

        if (!trigger) { return false; }

        //patch: cache cosine & sine
        var _cos = Math.cos(angle_rad);
        var _sin = Math.sin(angle_rad);

        //patch: calculate the correct mouse offset for a more natural feel
        var ndx = dx * _cos + dy * _sin;
        var ndy = dy * _cos - dx * _sin;
        dx = ndx;
        dy = ndy;

        // Calculate the attrs that will be change
        data = trigger.apply(this, [event, dx, dy]);

        // Put this in the mouseDrag handler since the user can start pressing shift while resizing
        this._updateVirtualBoundaries(isShiftHold);
        if (this._aspectRatio || isShiftHold ) { data = this._updateRatio(data, event); }

        data = this._respectSize(data, event);
        //patch: backup the position
        var oldPosition = {left: this.position.left, top: this.position.top};
        this._updateCache(data);

        //patch: revert to old position
        this.position = {left: oldPosition.left, top: oldPosition.top};

        //patch: difference between datas
        var diffData = {
            left: _parseFloat(data.left || this.lastData.left) - _parseFloat(this.lastData.left),
            top:  _parseFloat(data.top || this.lastData.top)  - _parseFloat(this.lastData.top),
        }

        //patch: calculate the correct position offset based on angle
        var new_data = {};
        new_data.left = diffData.left * _cos - diffData.top  * _sin;
        new_data.top  = diffData.top  * _cos + diffData.left * _sin;

        //patch: round the values
        new_data.left = _round(new_data.left);
        new_data.top  = _round(new_data.top);

        //patch: update the position
        this.position.left += new_data.left;
        this.position.top  += new_data.top;

        //patch: save the data for later use
        this.lastData = {
            left: _parseFloat(data.left || this.lastData.left),
            top:  _parseFloat(data.top  || this.lastData.top)
        };

        // plugins callbacks need to be called first
        this._propagate("resize", event);
        //patch: calculate the difference in size
        var diff_w = init_w - this.size.width;
        var diff_h = init_h - this.size.height;

        //patch: get the offset based on angle
        var offset = $.getCorrection(init_w, init_h, diff_w, diff_h, angle);
        //patch: update the position
        this.position.left += offset.left;
        this.position.top -= offset.top;

        if (this.position.top !== prevTop) { props.top = this.position.top + "px"; }
        if (this.position.left !== prevLeft) { props.left = this.position.left + "px"; }
        if (this.size.width !== prevWidth) { props.width = this.size.width + "px"; }
        if (this.size.height !== prevHeight) { props.height = this.size.height + "px"; }
        el.css(props);

        if (!this._helper && this._proportionallyResizeElements.length) { this._proportionallyResize(); }

        // Call the user callback if the element was resized
        if ( ! $.isEmptyObject(props) ) { this._trigger("resize", event, this.ui()); }

        return false;
    }

    //patch: get the angle
    function getAngle(el) {
        var st = window.getComputedStyle(el, null);
        var tr = st.getPropertyValue("-webkit-transform") ||
            st.getPropertyValue("-moz-transform") ||
            st.getPropertyValue("-ms-transform") ||
            st.getPropertyValue("-o-transform") ||
            st.getPropertyValue("transform") ||
            null;
        if(tr && tr != "none"){
            var values = tr.split('(')[1];
            values = values.split(')')[0];
            values = values.split(',');

            var a = values[0];
            var b = values[1];

            var angle = Math.round(Math.atan2(b, a) * (180/Math.PI));
            while(angle >= 360) angle = 360-angle;
            while(angle < 0) angle = 360+angle;
            // LOG.D("angle: " + angle) // CLR:PM
            return angle;
        } else return 0;
    }

    function _parseFloat(e) { return isNaN(parseFloat(e)) ? 0: parseFloat(e); }

    function _round(e) { return Math.round((e + 0.00001) * 100) / 100 }
    /* end of patch functions */

    // https://github.com/godswearhats/jquery-ui-rotatable
    jQuery(div).resizable({
        // aspectRatio: (this.image_.width / this.image_.height),
        ghost: true,
        handles: "sw, se, nw, ne",
        helper: "resizable-helper",
        aspectRatio: false,
        start: function (event, ui) {
            freezeMap(self);
        },
        stop: function (event, ui) {
            unfreezeMap(self);

            self.ctx.clearRect(0, 0, self.ctx.canvas.width, self.ctx.canvas.height);
            self.width = ui.size.width;
            self.height = ui.size.height;

            self.setCanvasSize();
            self.ctx.save();
            self.ctx.translate((self.ctx.canvas.width / 2), (self.ctx.canvas.height / 2));
            self.ctx.drawImage(self.image_, -(self.width / 2), -(self.height / 2), self.width, self.height);
            self.ctx.restore();
            var tmpProjection = self.getProjection() ;
            if (tmpProjection != null) {
                // south-west
                var BL = projection.fromContainerPixelToLatLng(new google.maps.Point(self.left, self.top + self.height), true);
                // north-east
                var TR = projection.fromContainerPixelToLatLng(new google.maps.Point(self.left + self.width, self.top), true);
                var TL = new google.maps.LatLng(BL.lat(), TR.lng());  // north-west

                LOG.D3("Resized: BOTTOM LEFT: " + BL)
                LOG.D3("Resized:   TOP RIGHT: " + TR)
                var width_top = round(calculate_distance(TR.lat(), TR.lng(), TL.lat(), TL.lng()), 1);
                var height_left = round(calculate_distance(TL.lat(), TL.lng(), BL.lat(), BL.lng()), 1);

                // for verification:
                // var BR = new google.maps.LatLng(TR.lat(), BL.lng());  // south-east
                // var width_bottom = round(calculate_distance(BR.lat(), BR.lng(), BL.lat(), BL.lng()), 1);
                // var height_right = round(calculate_distance(TR.lat(), TR.lng(), BR.lat(), BR.lng()), 1);
                // var diagonal = round(calculate_distance(TR.lat(), TR.lng(), BL.lat(), BL.lng()), 1);
                var msg = "Dimensions: width: " + width_top + " height:" + height_left + " (meters)"
                LOG.D(msg);
                _info(self.angularScope, msg);
            }
        }
    }).rotatable({
        wheelRotate: false,
        start: function (event, ui) {
            freezeMap(self);
        },
        stop: function (event, ui) {
            unfreezeMap(self);
            self.angle = ui.angle.degrees;
        }
    });

    jQuery(div).draggable({
        start: function (event, ui) {
            freezeMap(self);
        },
        stop: function (event, ui) {
            unfreezeMap(self);
            if (projection != null) {  // update the coordinates
                var left = $(this).position().left;
                var top = $(this).position().top;
                self.latlng = projection.fromDivPixelToLatLng(new google.maps.Point(left, top), true);
                LOG.D1("Moved: left:top " + left + " " + top)
            }
        }
    });

    // Create a Canvas element and attach it to the DIV.
    var canvas = document.createElement('canvas');
    canvas.id = "canvas";
    div.appendChild(canvas);

    // Set the overlay's div_ property to this DIV
    this.div_ = div;
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");

    // load the floor
    this.initImage();
    // We add an overlay to a map via one of the map's panes.
    // We'll add this overlay to the overlayImage pane.
    var panes = this.getPanes();
    panes.overlayImage.appendChild(this.div_);
    return this;
}

function freezeMap(canvasOverlay) {
    document.body.style.cursor='move';
    canvasOverlay.map_.set('draggable', false);
    canvasOverlay.map_.setOptions({draggable: false, zoomControl: false, scrollwheel: false, disableDoubleClickZoom: true});
}

function unfreezeMap(canvasOverlay) {
    document.body.style.cursor='default';
    canvasOverlay.map_.setOptions({draggable: true, zoomControl: true, scrollwheel: true, disableDoubleClickZoom: false});
}


CanvasOverlay.prototype.draw = function () {
    var div = this.div_;
    if (this.canvas == null) { alert("error creating the canvas"); }
}

CanvasOverlay.prototype.onRemove = function () { this.div_.parentNode.removeChild(this.div_); }

// Note that the visibility property must be a string enclosed in quotes
CanvasOverlay.prototype.hide = function () { if (this.div_) { this.div_.style.visibility = 'hidden'; } }
CanvasOverlay.prototype.show = function () { if (this.div_) { this.div_.style.visibility = 'visible'; } }

CanvasOverlay.prototype.toggle = function () {
    if (this.div_) {
        if (this.div_.style.visibility == 'hidden') {
            this.show();
        } else {
            this.hide();
        }
    }
}

CanvasOverlay.prototype.toggleDOM = function () {
    if (this.getMap()) this.setMap(null);
    else this.setMap(this.map_);
}

/**
 *  CANVAS METHODS
 */

/**
 * WORKAROUND: creating a new canvas in which we place again the image
 * without resizing it as this significantly decreases the quality.
 *
 * @returns {HTMLCanvasElement} a new canvas with the full quality of the original image upload
 */
CanvasOverlay.prototype.getCanvas = function () {
    // Create a Canvas element and attach it to the DIV.
    var new_canvas= document.createElement('canvas');
    new_canvas.setAttribute('width', this.FullWidth);
    new_canvas.setAttribute('height', this.FullHeight);

    // scaling not needed as the original image (full quality)
    // will be aligned to the already selected dimensions (from the lower-quality canvas_
    var scaleW = this.FullWidth/this.width;
    var scaleH = this.FullHeight/this.height;
    LOG.D4("scaleW: " + scaleW)
    LOG.D4("scaleH: " + scaleH)

    var rdata = calculateRotationCorners(this.lastCenter, this.lastRads, this.FullWidth, this.FullHeight);

    var new_ctx = new_canvas.getContext('2d');
    new_ctx.canvas.width = rdata.w;
    new_ctx.canvas.height = rdata.h;

    new_ctx.translate(rdata.pCenterX- rdata.left, rdata.pCenterY - rdata.top);
    new_ctx.rotate(this.lastRads);
    new_ctx.drawImage(this.image_, -(this.FullWidth / 2), -(this.FullHeight/ 2), this.FullWidth, this.FullHeight);
    return new_canvas;
}

CanvasOverlay.prototype.getContext2d = function () { return this.ctx; }

/**
 * EDITING METHODS
 */
CanvasOverlay.prototype.setCanvasSize = function () {
    this.ctx.canvas.width = this.width;
    this.ctx.canvas.height = this.height;

    // we need to change the width and height of the div #canvas_editor
    // which is the element being rotated by the slider
    this.div_.style.width = this.width + 'px';
    this.div_.style.height = this.height + 'px';
}

CanvasOverlay.prototype.initImage = function () {
    LOG.D4("initImage")
    this.setCanvasSize();
    this.ctx.save();

    this.ctx.translate((this.ctx.canvas.width / 2), (this.ctx.canvas.height / 2));
    this.ctx.rotate(this.angle);
    this.ctx.drawImage(this.image_, -(this.width / 2), -(this.height / 2), this.width, this.height);
    this.ctx.restore();
}

/**
 *  Calculate the 4 new corners for rotation
 *  - http://stackoverflow.com/a/622172/1066790
 *  - https://en.wikipedia.org/wiki/Transformation_matrix#Rotation
 *
 * @param pCenter old center
 * @param r radians
 * @param w widdth
 * @param h height
 * @returns {{}}
 */
function calculateRotationCorners(pCenter, r, w, h) {
    // p in the below vars stands for previous
    var pLeft = pCenter.left;
    var pTop = pCenter.top;
    LOG.D4("calculateRotationCorners: pLeft: " + pLeft)
    LOG.D4("calculateRotationCorners: pTop: " + pTop)
    var pCenterX = pLeft + (w) / 2;
    var pCenterY = pTop + (h) / 2;

    var topLeftX = pCenterX + (pLeft - pCenterX) * Math.cos(r) + (pTop - pCenterY) * Math.sin(r);
    var topLeftY = pCenterY - (pLeft - pCenterX) * Math.sin(r) + (pTop - pCenterY) * Math.cos(r);
    var topRightX = pCenterX + (pLeft + (w) - pCenterX) * Math.cos(r) + (pTop - pCenterY) * Math.sin(r);
    var topRightY = pCenterY - (pLeft + (w) - pCenterX) * Math.sin(r) + (pTop - pCenterY) * Math.cos(r);
    var bottomLeftX = pCenterX + (pLeft - pCenterX) * Math.cos(r) + (pTop + (h) - pCenterY) * Math.sin(r);
    var bottomLeftY = pCenterY - (pLeft - pCenterX) * Math.sin(r) + (pTop + (h) - pCenterY) * Math.cos(r);
    var bottomRightX = pCenterX + (pLeft + (w) - pCenterX) * Math.cos(r) + (pTop + (h) - pCenterY) * Math.sin(r);
    var bottomRightY = pCenterY - (pLeft + (w) - pCenterX) * Math.sin(r) + (pTop + (h) - pCenterY) * Math.cos(r);

    // calculate new coordinates finding the top left
    var maxx = Math.max(topLeftX, topRightX, bottomLeftX, bottomRightX);
    var maxy = Math.max(topLeftY, topRightY, bottomLeftY, bottomRightY);
    var minx = Math.min(topLeftX, topRightX, bottomLeftX, bottomRightX);
    var miny = Math.min(topLeftY, topRightY, bottomLeftY, bottomRightY);

    var res = {};
    res.pCenterX= pCenterX;
    res.pCenterY= pCenterY;
    res.top = miny;
    res.left = minx;
    res.w = maxx - minx;
    res.h = maxy - miny

    return res;
}

CanvasOverlay.prototype.drawBoundingCanvas = function () {
    LOG.D3("drawBoundingCanvas")
    // convert degrees rotation to angle radians
    var degrees = getRotationDegrees($('#canvas_editor'));
    var rads = deg2rad(degrees);

    $('#canvas_editor').css({
        '-moz-transform': 'rotate(0deg)',
        '-webkit-transform': 'rotate(0deg)',
        '-ms-transform': 'rotate(0deg)',
        '-o-transform': 'rotate(0deg)',
        'transform': 'rotate(0deg)'});

    // get the center which we use to rotate the image
    // this is the center when the canvas is rotated at 0 degrees
    var oldCenter = getPositionData($('#canvas_editor'));
    this.lastCenter=oldCenter;
    this.lastRads = rads;
    LOG.D5("drawBoundingCanvas: lastRads: " + rads)

    var rdata = calculateRotationCorners(oldCenter, rads, this.width, this.height);

    // move the canvas to the new top left position
    $('#canvas_editor').css({
        'top': rdata.top + 'px',
        'left': rdata.left + 'px'
    })

    this.ctx.canvas.width = rdata.w;
    this.ctx.canvas.height = rdata.h;
    this.ctx.save();
    this.ctx.clearRect(0, 0, this.ctx.canvas.width, this.ctx.canvas.height);
    this.ctx.translate(rdata.pCenterX - rdata.left, rdata.pCenterY - rdata.top);
    this.ctx.rotate(rads);
    this.ctx.drawImage(this.image_, -(this.width / 2), -(this.height / 2), this.width, this.height);
    this.ctx.restore();

    // we should now update the coordinates for the new image
    this.top = rdata.top;
    this.left = rdata.left;
    var projection;
    if ((projection = this.getProjection()) != null) {
        this.bottom_left_coords = projection.fromContainerPixelToLatLng(new google.maps.Point(this.left, this.top + rdata.h), true);
        this.top_right_coords = projection.fromContainerPixelToLatLng(new google.maps.Point(this.left + rdata.w, this.top), true);
        LOG.D("drawBoundingCanvas: BOTTOM LEFT: " + this.bottom_left_coords)
        LOG.D("drawBoundingCanvas:   TOP RIGHT: " + this.top_right_coords)
    }
}

/**
 * HELPER FUNCTIONS
 */
function deg2rad(deg) { return deg * Math.PI / 180; }
function rad2deg(rad) { return rad / Math.PI * 180; }

function getRotationDegrees(obj) {
    var matrix = obj.css("-webkit-transform") ||
        obj.css("-moz-transform") ||
        obj.css("-ms-transform") ||
        obj.css("-o-transform") ||
        obj.css("transform");
    if (matrix !== 'none') {
        var values = matrix.split('(')[1].split(')')[0].split(',');
        var a = values[0];
        var b = values[1];
        var c = values[2];
        var d = values[3];

        var sin = b / scale;
        var scale = Math.sqrt(a * a + b * b);
        var angle = Math.round(Math.atan2(b, a) * (180 / Math.PI));
        //var angle = Math.atan2(b, a) * (180/Math.PI);
    } else {
        var angle = 0;
    }

    LOG.D4("getRotationDegrees: angle: " + angle)
    return angle;
}

// http://jsfiddle.net/Y8d6k/
var getPositionData = function (el) {
    return $.extend({
        width: el.outerWidth(false),
        height: el.outerHeight(false)
    }, el.offset());
};
