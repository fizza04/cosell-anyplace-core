/*
 * Anyplace: A free and open Indoor Navigation Service with superb accuracy!
 *
 * Anyplace is a first-of-a-kind indoor information service offering GPS-less
 * localization, navigation and search inside buildings using ordinary smartphones.
 *
 * Author(s): Nikolas Neofytou, Paschalis Mpeis
 *
 * Supervisor: Demetrios Zeinalipour-Yazti
 *
 * URL: https://anyplace.cs.ucy.ac.cy
 * Contact: anyplace@cs.ucy.ac.cy
 *
 * Copyright (c) 2021, Data Management Systems Lab (DMSL), University of Cyprus.
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
package controllers.helper

import datasources.{MongodbDatasource, ProxyDataSource, SCHEMA}
import play.api.Configuration

import javax.inject.{Inject, Singleton}
import play.api.libs.json.{JsValue, Json}
import utils.{LOG, Network}

import java.security.MessageDigest

@Singleton
class User @Inject()(pds: ProxyDataSource,
                     conf: Configuration){


  /**
   * Calls Google API to verify a Google users access token, which was sent by the client.
   *
   * @param authToken Google Authentication Token (OAuth)
   * @return
   */
  def verifyGoogleUser(authToken: String): String = {
    LOG.D3("User: verifyGoogleUser")
    // remove the double string quotes due to json processing
    val gURL = "https://www.googleapis.com/oauth2/v3/tokeninfo?id_token=" + authToken
    var res = ""
    try {
      res = Network.GET(gURL)
      // TODO: fill User/Account profile of database with: given_name (first name), and the family_name (last name),
      // when a user logs in (in the case these were empty before).
      // The picture URL could be updated each time (and this replicated on the mobile app as well).
      LOG.D4("verifyGoogleUser: " + res)
    } catch {
      case e: Exception => LOG.E("verifyId", e)
    }
    if (res != null) {
      try {
        val json = Json.parse(res)
        val uid = json \ "user_id"
        val sub = json \ "sub"


        if (uid.toOption.isDefined)
          return uid.as[String]
        if (sub.toOption.isDefined)
          return sub.as[String]
      } catch {
        case iae: IllegalArgumentException => LOG.E("verifyId: " + iae.getMessage + "String: '" + res + "'");
        case e: Exception => LOG.E("verifyId", e)
      }
    } else {
      LOG.E("User: VerifyGoogleUser: failed.")
    }
    null
  }

  /**
   * Checks in database if a user exists with the access_token of the json.
   *
   * apiKey: access_token for authorization
   * @return the owner_id of the user.
   */
  def authorize(apiKey: String): String = {
    val user = pds.db.getFromKeyAsJson(SCHEMA.cUsers, SCHEMA.fAccessToken, apiKey)
    if (user != null)
      return (user \ SCHEMA.fOwnerId).as[String]
    null
  }

  def isAdminOrModerator(userId: String): Boolean = {
    // Admin
    if (MongodbDatasource.getAdmins.contains(userId)) return true
    else if (MongodbDatasource.getModerators.contains(userId)) return true

    false
  }

  def canAccessSpace(space: JsValue, userId: String): Boolean = {
    if (isAdminOrModerator(userId)) return true
     isSpaceOwner(space, userId) || isSpaceCoOwner(space, userId)
  }

  private def isSpaceOwner(building: JsValue, userId: String): Boolean = {

    if (building != null && (building \ SCHEMA.fOwnerId).toOption.isDefined &&
      (building \ (SCHEMA.fOwnerId)).as[String].equals(userId)) return true
    false
  }

  private def isSpaceCoOwner(building: JsValue, userId: String): Boolean = {
    if (building != null) {
      val cws = (building \ SCHEMA.fCoOwners)
      if (cws.toOption.isDefined) {
        val co_owners = cws.as[List[String]]
        for (co_owner <- co_owners) {
          if (co_owner == userId)
            return true
        }
      }
    }
    false
  }

  def getEncryptedPassword(password: String): String = {
    val salt = conf.get[String]("password.salt")
    val pepper = conf.get[String]("password.pepper")

    val str = salt + password + pepper
    val encryptedPwd = encryptInternal(str)
    LOG.D5("pwd: '" + str + "'")
    LOG.D5("encrypted: '" + encryptedPwd + "'")
    encryptedPwd
  }

  private def encryptInternal(password: String): String = {
    val algorithm: MessageDigest = MessageDigest.getInstance("SHA-256")
    val defaultBytes: Array[Byte] = password.getBytes
    algorithm.reset()
    algorithm.update(defaultBytes)
    val messageDigest: Array[Byte] = algorithm.digest
    getHexString(messageDigest)
  }

  private def getHexString(messageDigest: Array[Byte]): String = {
    val hexString: StringBuffer = new StringBuffer
    messageDigest foreach { digest =>
      val hex = Integer.toHexString(0xFF & digest)
      if (hex.length == 1) hexString.append('0') else hexString.append(hex)
    }
    hexString.toString
  }
}
