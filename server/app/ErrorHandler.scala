/*
 * Anyplace: A free and open Indoor Navigation Service with superb accuracy!
 *
 * Anyplace is a first-of-a-kind indoor information service offering GPS-less
 * localization, navigation and search inside buildings using ordinary smartphones.
 *
 * Author(s): Paschalis Mpeis
 *
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

import java.io.{PrintWriter, StringWriter}
import play.api.http.HttpErrorHandler

import scala.concurrent._
import javax.inject.Singleton
import play.api.mvc._
import play.api.mvc.Results._
import utils.{RESPONSE, LOG, Utils}

// TODO: only emit json for all endpoints that contain /api
@Singleton
class ErrorHandler extends HttpErrorHandler {

    def errorMsg(request: RequestHeader): String = {
        "Requested: " + request.method + " "  + request.uri +
          " SSL:" + request.secure + " HOST:" + request.host
    }

    def fullStacktrace(exception: Throwable): String= {
        val sw = new StringWriter
        exception.printStackTrace(new PrintWriter(sw))
        "StackTrace: " + sw.toString
    }

    def onClientError(request: RequestHeader, statusCode: Int, message: String): Future[Result] = {
        // WORKAROUND: do NOT log any errors regarding this legacy code.
        // Remove this dependency if is not used
        if(request.path ==
          "/architect/bower_components/angularjs-dropdown-multiselect/pages/images/hr.png") {
            return Future.successful(Status(statusCode))
        }

        val eid = Utils.genErrorUniqueID()
        val errInt = "404: ID: " + eid
        val errPub =  "Client Error: 404: Error ID: " + eid
        val msg = errInt + " " + errorMsg(request)

        LOG.E(msg)

        if(request.path.startsWith("/api")) { // API requests return json
            Future.successful(RESPONSE.BAD(msg))
        } else { // otherwise HTML
            Future.successful(Status(statusCode)(
                errPub + "\n\n\n" + errorMsg(request)))
        }
    }

    def onServerError(request: RequestHeader, exception: Throwable): Future[Result] = {
        val eid = Utils.genErrorUniqueID()
        val errInt = "500: ID: " + eid + ":"
        val msg : String = errInt + " " + errorMsg(request) + "\n" + exception.getClass + ": " + exception.getMessage
        LOG.E(msg)

        if (exception.isInstanceOf[MatchError]) {
            // CHECK if OK leave like this
            LOG.D("Skip full stacktrace?") // CHECK::NN
            return Future.successful(InternalServerError(msg))
        } else {
            LOG.E("StackTrace: " + fullStacktrace(exception))
        }

        //  Handle:
        //  p.c.s.n.PlayDefaultU | 24/07/20 01:37:58 | ERROR | Exception caught in Netty
        ////  java.lang.IllegalArgumentException: empty text
        //  val msg =  errPub + "\n\n\n" + errorMsg(request) +
        //    "\nCause: " + exception.getMessage + infoGithub(eid)

        if(request.path.startsWith("/api")) { // return JSON
            Future.successful(RESPONSE.BAD(msg))
        }  else { // return HTML
            Future.successful(InternalServerError(msg))
        }
    }
}
