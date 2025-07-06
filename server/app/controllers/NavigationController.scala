/*
 * Anyplace: A free and open Indoor Navigation Service with superb accuracy!
 *
 * Anyplace is a first-of-a-kind indoor information service offering GPS-less
 * localization, navigation and search inside buildings using ordinary smartphones.
 *
 * Author(s): Nikolas Neofytou, Constantinos Costa, Kyriakos Georgiou, Lambros Petrou
 *
 * Co-Supervisor: Paschalis Mpeis
 * Supervisor: Demetrios Zeinalipour-Yazti
 *
 * URL: https://anyplace.cs.ucy.ac.cy
 * Contact: anyplace@cs.ucy.ac.cy
 *
 * Copyright (c) 2016, Data Management Systems Lab (DMSL), University of Cyprus.
 * All rights reserved.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of
 * this software and associated documentation files (the “Software”), to deal in the
 * Software without restriction, including without limitation the rights to use, copy,
 * modify, merge, publish, distribute, sublicense, and/or sell copies of the Software,
 * and to permit persons to whom the Software is furnished to do so, subject to the
 * following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED “AS IS”, WITHOUT WARRANTY OF ANY KIND, EXPRESS
 * OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
 * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
 * DEALINGS IN THE SOFTWARE.
 *
 */
package controllers

import datasources.{DatasourceException, ProxyDataSource, SCHEMA}
import models.NavResultPoint
import models.oauth.OAuth2Request
import play.api.libs.json.{JsObject, JsValue, Json}
import play.api.mvc._
import utils._
import utils.json.VALIDATE

import java.util
import java.util.{ArrayList, HashMap, List}
import javax.inject.{Inject, Singleton}
import scala.jdk.CollectionConverters.CollectionHasAsScala

@Singleton
class NavigationController @Inject()(cc: ControllerComponents,
                                     pds: ProxyDataSource)
  extends AbstractController(cc) {
  /** Limit route's distance in km (kilometers). 0 disables the check */
  val ROUTE_MAX_DISTANCE = 5

  def getBuildingById: Action[AnyContent] = Action {
    implicit request =>
      def inner(request: Request[AnyContent]): Result = {
        val anyReq = new OAuth2Request(request)
        if (!anyReq.assertJsonBody()) {
          return RESPONSE.BAD(RESPONSE.ERROR_JSON_PARSE)
        }
        val json = anyReq.getJsonBody()
        LOG.D2("getBuildingById: " + json.toString)
        val checkRequirements = VALIDATE.checkRequirements(json, SCHEMA.fBuid)
        if (checkRequirements != null) return checkRequirements
        val buid = (json \ SCHEMA.fBuid).as[String]
        try {
          val doc = pds.db.buildingFromKeyAsJson(buid)
          if (doc == null) {
            return RESPONSE.BAD_CANNOT_RETRIEVE_SPACE
          }
          return RESPONSE.OK(doc, "Successfully fetched building information.")
        } catch {
          case e: DatasourceException => return RESPONSE.ERROR_INTERNAL("500: " + e.getMessage + "]")
        }
      }

      inner(request)
  }

  def getPoisById: Action[AnyContent] = Action {
    implicit request =>
      def inner(request: Request[AnyContent]): Result = {
        val anyReq = new OAuth2Request(request)
        if (!anyReq.assertJsonBody()) {
          return RESPONSE.BAD(RESPONSE.ERROR_JSON_PARSE)
        }
        val json = anyReq.getJsonBody()
        LOG.D2("getPoisById: " + json.toString)
        val checkRequirements = VALIDATE.checkRequirements(json, SCHEMA.cPOIS)
        if (checkRequirements != null) return checkRequirements
        val puid = (json \ SCHEMA.cPOIS).as[String]
        try {
          var doc = pds.db.poiFromKeyAsJson(SCHEMA.cPOIS, SCHEMA.fPuid, puid)
          if (doc == null) {
            return RESPONSE.BAD_CANNOT_RETRIEVE_POI
          }
          doc = doc.as[JsObject] - SCHEMA.fOwnerId - SCHEMA.fId - SCHEMA.fSchema
          return RESPONSE.OK(doc, "Fetched POI information.")
        } catch {
          case e: DatasourceException => return RESPONSE.ERROR_INTERNAL("500: " + e.getMessage + "]")
        }
      }

      inner(request)
  }

  def getNavigationRoute: Action[AnyContent] = Action {
    implicit request =>
      def inner(request: Request[AnyContent]): Result = {
        val anyReq = new OAuth2Request(request)
        if (!anyReq.assertJsonBody()) {
          return RESPONSE.BAD(RESPONSE.ERROR_JSON_PARSE)
        }
        val json = anyReq.getJsonBody()
        LOG.D2("getNavigationRoute: " + json.toString)
        val checkRequirements = VALIDATE.checkRequirements(json, "pois_from", "pois_to")
        if (checkRequirements != null) return checkRequirements
        val puid_from = (json \ "pois_from").as[String]
        val puid_to = (json \ "pois_to").as[String]
        if (puid_from.equalsIgnoreCase(puid_to)) {
          return RESPONSE.BAD("Destination and Source is the same.")
        }
        try {
          val poiFrom = pds.db.getFromKeyAsJson(SCHEMA.cPOIS, SCHEMA.fPuid, puid_from)
          if (poiFrom == null) {
            return RESPONSE.BAD_CANNOT_RETRIEVE("Source POI")
          }
          val poiTo = pds.db.getFromKeyAsJson(SCHEMA.cPOIS, SCHEMA.fPuid, puid_to)
          if (poiTo == null) {
            return RESPONSE.BAD_CANNOT_RETRIEVE("Destination POI")
          }
          val buid_from = (poiFrom \ SCHEMA.fBuid).as[String]
          val floor_from = (poiFrom \ SCHEMA.fFloorNumber).as[String]
          val buid_to = (poiTo \ SCHEMA.fBuid).as[String]
          val floor_to = (poiTo \ SCHEMA.fFloorNumber).as[String]
          var points: util.List[JsValue] = null
          if (buid_from.equalsIgnoreCase(buid_to)) {
            if (floor_from.equalsIgnoreCase(floor_to)) {
              points = navigateSameFloor(poiFrom, poiTo)
            } else {
              points = navigateSameBuilding(poiFrom, poiTo)
            }
          } else {
            return RESPONSE.BAD("Navigation between buildings not supported yet.")
          }
          val res: JsValue = Json.obj("num_of_pois" -> points.size, SCHEMA.cPOIS -> points.asScala)
          return RESPONSE.OK(res, "Plotted navigation.")
        } catch {
          case e: DatasourceException => return RESPONSE.ERROR_INTERNAL("500: " + e.getMessage)
        }
      }

      inner(request)
  }

  def getNavigationRouteXY: Action[AnyContent] = Action {
    implicit request =>
      def inner(request: Request[AnyContent]): Result = {
        val anyReq = new OAuth2Request(request)
        if (!anyReq.assertJsonBody()) return RESPONSE.BAD(RESPONSE.ERROR_JSON_PARSE)
        val json = anyReq.getJsonBody()
        LOG.D2("getNavigationRouteXY: " + json.toString)
        val checkRequirements = VALIDATE.checkRequirements(json,
          SCHEMA.fCoordinatesLat, SCHEMA.fCoordinatesLon, SCHEMA.fFloorNumber,
          "pois_to")
        if (checkRequirements != null) return checkRequirements
        val coordinates_lat = (json \ SCHEMA.fCoordinatesLat).as[String]
        val coordinates_lon = (json \ SCHEMA.fCoordinatesLon).as[String]
        val floor_number = (json \ SCHEMA.fFloorNumber).as[String]
        val puid_to = (json \ "pois_to").as[String]
        var res: Result = null
        try {
          val poiTo = pds.db.getFromKeyAsJson(SCHEMA.cPOIS, SCHEMA.fPuid, puid_to)
          if (poiTo == null) {
            return RESPONSE.BAD("Destination POI does not exist or could not be retrieved.")
          }
          val buid_to = (poiTo \ SCHEMA.fBuid).as[String]
          val floor_to = (poiTo \ SCHEMA.fFloorNumber).as[String]
          val dlat = java.lang.Double.parseDouble(coordinates_lat)
          val dlon = java.lang.Double.parseDouble(coordinates_lon)
          val floorPois = pds.db.poisByBuildingFloorAsJson(buid_to, floor_number)
          if (0 == floorPois.size) {
            return RESPONSE.BAD("Navigation is not supported on your floor.")
          }

          var dlat2: Double = 0.0
          var dlon2: Double = 0.0
          var min_distance = java.lang.Double.POSITIVE_INFINITY
          var cdist: Double = 0.0
          // Find the closest POI to start navigation
          var startingPoi: JsValue = null
          for (poi <- floorPois) {
            dlat2 = java.lang.Double.parseDouble((poi \ SCHEMA.fCoordinatesLat).as[String])
            dlon2 = java.lang.Double.parseDouble((poi \ SCHEMA.fCoordinatesLon).as[String])
            cdist = GeoPoint.getDistanceBetweenPoints(dlon, dlat, dlon2, dlat2, "K")
            if (cdist < min_distance) {
              min_distance = cdist
              startingPoi = poi
            }
          }
          if (startingPoi == null) {
            val msg = "Navigation is not supported from your position."
            return RESPONSE.BAD(msg)
          } else if (ROUTE_MAX_DISTANCE > 0 && min_distance > ROUTE_MAX_DISTANCE) {
            val msg = "No Navigation supported at this position: startingPoi>=5km"
            LOG.D1(msg)
            return RESPONSE.BAD(msg)
          }

          LOG.D3("Starting poi: " + (startingPoi \ SCHEMA.fPuid).as[String])
          LOG.D3("min_distance: " + min_distance)
          val buid_from = (startingPoi \ SCHEMA.fBuid).as[String]
          val floor_from = (startingPoi \ SCHEMA.fFloorNumber).as[String]
          var points: util.List[JsValue] = null
          if (buid_from.equalsIgnoreCase(buid_to)) {
            points = if (floor_from.equalsIgnoreCase(floor_to)) navigateSameFloor(startingPoi, poiTo)
            else navigateSameBuilding(startingPoi, poiTo)
          } else {
            val msg  = "Navigation between buildings not supported yet."
            return RESPONSE.BAD(msg)
          }
          val json: JsValue = Json.obj("num_of_pois" -> points.size, SCHEMA.cPOIS -> points.asScala)
          return RESPONSE.OK(json, "Successfully plotted navigation.")
        } catch {
          //case e: DatasourceException => AnyResponseHelper.internal_server_error("500: " + e.getMessage)
          case e: Exception => return RESPONSE.ERROR_INTERNAL(e.getClass.toString + ": " + e.getMessage)
        }
      }

      inner(request)
  }

  private def navigateSameFloor(from: JsValue, to: JsValue): List[JsValue] = {
    navigateSameFloor(from, to, pds.db.poisByBuildingFloorAsMap((from \ SCHEMA.fBuid).as[String],
      (from \ SCHEMA.fFloorNumber).as[String]))
  }

  private def navigateSameFloor(from: JsValue, to: JsValue, floorPois: util.List[HashMap[String, String]]): util.List[JsValue] = {
    val graph = new Dijkstra.Graph()
    graph.addPois(floorPois)
    graph.addEdges(pds.db.connectionsByBuildingAsMap((from \ SCHEMA.fBuid).as[String]))
    val routePois = Dijkstra.getShortestPath(graph, (from \ SCHEMA.fPuid).as[String], (to \ SCHEMA.fPuid).as[String])

    val final_points = new util.ArrayList[JsValue]()
    var p: NavResultPoint = null
    for (poi <- routePois.asScala) {
      p = new NavResultPoint()
      p.lat = poi.get(SCHEMA.fCoordinatesLat)
      p.lon = poi.get(SCHEMA.fCoordinatesLon)
      p.puid = poi.get(SCHEMA.fPuid)
      p.buid = poi.get(SCHEMA.fBuid)
      p.floor_number = poi.get(SCHEMA.fFloorNumber)
      p.pois_type = poi.get(SCHEMA.fPoisType)
      final_points.add(p.toJson())
    }
    final_points
  }

  private def navigateSameBuilding(from: JsValue, to: JsValue): util.List[JsValue] = {
    val graph = new Dijkstra.Graph()
    graph.addPois(pds.db.poisByBuildingAsMap((from \ SCHEMA.fBuid).as[String]))
    graph.addEdges(pds.db.connectionsByBuildingAsMap((from \ SCHEMA.fBuid).as[String]))
    val routePois = Dijkstra.getShortestPath(graph, (from \ SCHEMA.fPuid).as[String], (to \ SCHEMA.fPuid).as[String])
    val final_points = new util.ArrayList[JsValue]()
    var p: NavResultPoint = null
    for (poi <- routePois.asScala) {
      p = new NavResultPoint()
      p.lat = poi.get(SCHEMA.fCoordinatesLat)
      p.lon = poi.get(SCHEMA.fCoordinatesLon)
      p.puid = poi.get(SCHEMA.fPuid)
      p.buid = poi.get(SCHEMA.fBuid)
      p.floor_number = poi.get(SCHEMA.fFloorNumber)
      final_points.add(p.toJson())
    }
    final_points
  }
}
