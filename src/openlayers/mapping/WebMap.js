/* Copyright© 2000 - 2025 SuperMap Software Co.Ltd. All rights reserved.
 * This program are made available under the terms of the Apache License, Version 2.0
 * which accompanies this distribution and is available at http://www.apache.org/licenses/LICENSE-2.0.html.*/
import proj4 from 'proj4';
import { FetchRequest } from '@supermapgis/iclient-common/util/FetchRequest';
import { ArrayStatistic } from '@supermapgis/iclient-common/util/ArrayStatistic';
import { ColorsPickerUtil } from '@supermapgis/iclient-common/util/ColorsPickerUtil';
import { SecurityManager } from '@supermapgis/iclient-common/security/SecurityManager';
import { Events } from '@supermapgis/iclient-common/commontypes/Events';
import { Util as CommonUtil } from '@supermapgis/iclient-common/commontypes/Util';
import { parseCondition, parseConditionFeature } from '@supermapgis/iclient-common/util/FilterCondition';
import { createLinesData } from '@supermapgis/iclient-common/mapping/utils/util';
import { Util } from '../core/Util';
import { getFeatureBySQL, queryFeatureBySQL, getFeatureProperties } from './webmap/Util';
import { StyleUtils } from '../core/StyleUtils';
import { TileSuperMapRest, Tianditu, BaiduMap } from '../mapping';
import { VectorTileSuperMapRest, Graphic as GraphicSource, MapboxStyles, OverlayGraphic } from '../overlay';
import { DataFlowService } from '../services';
import cloneDeep from 'lodash.clonedeep';

import SampleDataInfo from './webmap/config/SampleDataInfo.json'; // eslint-disable-line import/extensions

import GeoJSON from 'ol/format/GeoJSON';
import MVT from 'ol/format/MVT';
import Observable from 'ol/Observable';
import olMap from 'ol/Map';
import View from 'ol/View';
import MouseWheelZoom from 'ol/interaction/MouseWheelZoom';
import * as olProj from 'ol/proj';
import * as olProj4 from 'ol/proj/proj4';
import * as olLayer from 'ol/layer';
import WMTSCapabilities from 'ol/format/WMTSCapabilities';
import WMSCapabilities from 'ol/format/WMSCapabilities';
import TileGrid from 'ol/tilegrid/TileGrid';
import * as olTilegrid from 'ol/tilegrid';
import WMTSTileGrid from 'ol/tilegrid/WMTS';
import * as olGeometry from 'ol/geom';
import Vector from 'ol/source/Vector';
import XYZ from 'ol/source/XYZ';
import WMTS from 'ol/source/WMTS';
import BingMaps from 'ol/source/BingMaps';
import TileWMS from 'ol/source/TileWMS';
import Feature from 'ol/Feature';
import olRenderFeature from 'ol/render/Feature';
import Style from 'ol/style/Style';
import FillStyle from 'ol/style/Fill';
import StrokeStyle from 'ol/style/Stroke';
import Text from 'ol/style/Text';
import Collection from 'ol/Collection';
import { containsCoordinate, getCenter } from 'ol/extent';
import difference from 'lodash.difference';

window.proj4 = proj4;
window.Proj4js = proj4;
//数据转换工具
const transformTools = new GeoJSON();
// 迁徙图最大支持要素数量
const MAX_MIGRATION_ANIMATION_COUNT = 1000;
//不同坐标系单位。计算公式中的值
const metersPerUnit = {
  DEGREES: (2 * Math.PI * 6370997) / 360,
  DEGREE: (2 * Math.PI * 6370997) / 360,
  FEET: 0.3048,
  METERS: 1,
  METER: 1,
  M: 1,
  USFEET: 1200 / 3937
};
const dpiConfig = {
  default: 96, // 常用dpi
  iServerWMTS: 90.7142857142857 // iserver使用的wmts图层dpi
};
/**
 * @class WebMap
 * @category  iPortal/Online Resources Map
 * @classdesc 对接 iPortal/Online 地图类
 * @modulecategory Mapping
 * @param {Object} options - 参数。
 * @param {string} [options.target='map'] - 地图容器 ID。
 * @param {Object | string} [options.webMap] - webMap 对象，或者是获取 webMap 的 URL 地址。存在 webMap，优先使用 webMap，ID 的选项则会被忽略。
 * @param {number} [options.id] - 地图的 ID。
 * @param {string} [options.server] - 地图的地址，如果使用传入 ID，server 则会和 ID 拼接成 webMap 请求地址。
 * @param {function} [options.successCallback] - 成功加载地图后调用的函数。
 * @param {function} [options.errorCallback] - 加载地图失败调用的函数。
 * @param {string} [options.credentialKey] - 凭证密钥。例如为 "key"、"token"，或者用户自定义的密钥。用户申请了密钥，此参数必填。
 * @param {string} [options.credentialValue] - 凭证密钥对应的值，credentialKey 和 credentialValue 必须一起使用。
 * @deprecated {boolean} [options.withCredentials=false] - 请求是否携带 cookie。
 * @deprecated {boolean} [options.excludePortalProxyUrl] - server 传递过来的 URL 是否带有代理。
 * @param {Object} [options.serviceProxy] - SuperMap iPortal 内置代理信息，仅矢量瓦片图层上图才会使用。
 * @param {string} [options.tiandituKey] - 天地图的 key。
 * @param {string} [options.bingMapsKey] - 必应地图的 key。
 * @param {string} [options.googleMapsAPIKey] - 谷歌底图需要的 key。
 * @param {string} [options.proxy] - 代理地址，当域名不一致，请求会加上代理。避免跨域。
 * @param {string} [options.tileFormat] - 地图瓦片出图格式，png/webp。
 * @param {Object} [options.mapSetting] - 地图可选参数。
 * @param {function} [options.mapSetting.mapClickCallback] - 地图被点击的回调函数。
 * @param {function} [options.mapSetting.overlays] - 地图的 overlays。
 * @param {function} [options.mapSetting.controls] - 地图的控件。
 * @param {function} [options.mapSetting.interactions] - 地图控制的参数。
 * @param {number} [options.restDataSingleRequestCount=1000] - 自定义 restData 分批请求，单次请求数量。
 * @extends {ol.Observable}
 * @usage
 */
export class WebMap extends Observable {
  constructor(id, options) {
    super();
    if (Util.isObject(id)) {
      options = id;
      this.mapId = options.id;
    } else {
      this.mapId = id;
    }
    options = options || {};
    this.server = options.server;
    this.successCallback = options.successCallback;
    this.errorCallback = options.errorCallback;
    this.credentialKey = options.credentialKey;
    this.credentialValue = options.credentialValue;
    this.target = options.target || 'map';
    this.serviceProxy = options.serviceProxy || null;
    this.tiandituKey = options.tiandituKey;
    this.bingMapsKey = options.bingMapsKey || '';
    this.googleMapsAPIKey = options.googleMapsAPIKey || '';
    this.proxy = options.proxy;
    //计数叠加图层，处理过的数量（成功和失败都会计数）
    this.layerAdded = 0;
    this.layers = [];
    this.events = new Events(this, null, ['updateDataflowFeature'], true);
    this.webMap = options.webMap;
    this.tileFormat = options.tileFormat && options.tileFormat.toLowerCase();
    this.restDataSingleRequestCount = options.restDataSingleRequestCount || 1000;
    this.tileRequestParameters = options.tileRequestParameters;
    this.createMap(options.mapSetting);
    if (this.webMap) {
      // webmap有可能是url地址，有可能是webmap对象
      Util.isString(this.webMap) ? this.createWebmap(this.webMap) : this.getMapInfoSuccess(options.webMap);
    } else {
      this.createWebmap();
    }
  }

  /**
   * @private
   * @function WebMap.prototype._removeBaseLayer
   * @description 移除底图
   */
  _removeBaseLayer() {
    const map = this.map;
    const { layer, labelLayer } = this.baseLayer;
    // 移除天地图标签图层
    labelLayer && map.removeLayer(labelLayer);
    // 移除图层
    layer && map.removeLayer(layer);
    this.baseLayer = null;
  }

  /**
   * @private
   * @function WebMap.prototype._removeLayers
   * @description 移除叠加图层
   */
  _removeLayers() {
    const map = this.map;
    this.layers.forEach(({ layerType, layer, labelLayer, pathLayer, dataflowService }) => {
      if (!layer) {
        return;
      }
      if (layerType === 'MIGRATION') {
        layer.remove();
        return;
      }
      if (layerType === 'DATAFLOW_POINT_TRACK' || layerType === 'DATAFLOW_HEAT') {
        // 移除轨迹图层
        pathLayer && map.removeLayer(pathLayer);
        // 取消订阅
        dataflowService && dataflowService.unSubscribe();
      }
      // 移除标签图层
      labelLayer && map.removeLayer(labelLayer);
      // 移除图层
      map.removeLayer(layer);
    });
    this.layers = [];
  }

  /**
   * @private
   * @function WebMap.prototype.clear
   * @description 清空地图
   */
  _clear() {
    // 比例尺
    this.scales = [];
    // 分辨率
    this.resolutionArray = [];
    // 比例尺-分辨率 {scale: resolution}
    this.resolutions = {};
    // 计数叠加图层，处理过的数量（成功和失败都会计数）
    this.layerAdded = 0;

    this._removeBaseLayer();
    this._removeLayers();
  }

  /**
   * @function WebMap.prototype.refresh
   * @version 10.1.0
   * @description 重新渲染地图。
   */
  refresh() {
    this._clear();
    this.createWebmap();
  }

  /**
   * @private
   * @function WebMap.prototype.createMap
   * @description 创建地图对象以及注册地图事件
   * @param {Object} mapSetting - 关于地图的设置以及需要注册的事件
   */
  createMap(mapSetting) {
    let overlays, controls, interactions;
    if (mapSetting) {
      interactions = mapSetting.interactions;
      overlays = mapSetting.overlays;
      controls = mapSetting.controls;
    }
    this.map = new olMap({
      interactions: interactions,
      overlays: overlays,
      controls: controls,
      target: this.target
    });
    mapSetting &&
      this.registerMapEvent({
        mapClickCallback: mapSetting.mapClickCallback
      });
  }
  /**
   * @private
   * @function WebMap.prototype.registerMapEvent
   * @description 注册地图事件
   * @param {Object} mapSetting - 关于地图的设置以及需要注册的事件
   */
  registerMapEvent(mapSetting) {
    let map = this.map;
    map.on('click', function (evt) {
      mapSetting.mapClickCallback && mapSetting.mapClickCallback(evt);
    });
  }
  /**
   * @private
   * @function WebMap.prototype.createWebmap
   * @description 创建webmap
   * @param {string} webMapUrl - 请求webMap的地址
   */
  createWebmap(webMapUrl) {
    let mapUrl;
    if (webMapUrl) {
      mapUrl = webMapUrl;
    } else {
      let urlArr = this.server.split('');
      if (urlArr[urlArr.length - 1] !== '/') {
        this.server += '/';
      }
      mapUrl = this.server + 'web/maps/' + this.mapId + '/map';
      let filter = 'getUrlResource.json?url=';
      if (this.server.indexOf(filter) > -1) {
        //大屏需求,或者有加上代理的
        let urlArray = this.server.split(filter);
        if (urlArray.length > 1) {
          mapUrl = urlArray[0] + filter + this.server + 'web/maps/' + this.mapId + '/map.json';
        }
      }
    }
    this.getMapInfo(mapUrl);
  }

  /**
   * @private
   * @function WebMap.prototype.getMapInfo
   * @description 获取地图的json信息
   * @param {string} url - 请求地图的url
   */
  getMapInfo(url) {
    let that = this,
      mapUrl = url;
    if (url.indexOf('.json') === -1) {
      url = this.handleJSONSuffix(url);
      //传递过来的url,没有包括.json,在这里加上。
      mapUrl = url;
    }
    FetchRequest.get(that.getRequestUrl(mapUrl), null, {
      withCredentials: that.isCredentail(mapUrl)
    })
      .then(function (response) {
        return response.json();
      })
      .then(function (mapInfo) {
        that.getMapInfoSuccess(mapInfo);
      })
      .catch(function (error) {
        that.errorCallback && that.errorCallback(error, 'getMapFaild', that.map);
      });
  }

  /**
   * @private
   * @function WebMap.prototype.getMapInfoSuccess
   * @description 获取地图的json信息
   * @param {Object} mapInfo - webMap对象
   */
  async getMapInfoSuccess(mapInfo) {
    let that = this;
    if (mapInfo.succeed === false) {
      that.errorCallback && that.errorCallback(mapInfo.error, 'getMapFaild', that.map);
      return;
    }
    let handleResult = await that.handleCRS(mapInfo.projection, mapInfo.baseLayer.url);

    //存储地图的名称以及描述等信息，返回给用户
    that.mapParams = {
      title: mapInfo.title,
      description: mapInfo.description
    };

    if (handleResult.action === 'BrowseMap') {
      that.createSpecLayer(mapInfo);
    } else if (handleResult.action === 'OpenMap') {
      that.baseProjection = handleResult.newCrs || mapInfo.projection;
      that.webMapVersion = mapInfo.version;
      that.baseLayer = mapInfo.baseLayer;
      // that.mapParams = {
      //     title: mapInfo.title,
      //     description: mapInfo.description
      // }; //存储地图的名称以及描述等信息，返回给用户
      that.isHaveGraticule = mapInfo.grid && mapInfo.grid.graticule;

      if (mapInfo.baseLayer && mapInfo.baseLayer.layerType === 'MAPBOXSTYLE') {
        // 添加矢量瓦片服务作为底图
        that
          .addMVTMapLayer(mapInfo, mapInfo.baseLayer, 0)
          .then(async () => {
            that.createView(mapInfo);
            if (!mapInfo.layers || mapInfo.layers.length === 0) {
              that.sendMapToUser(0);
            } else {
              await that.addLayers(mapInfo);
            }
            that.addGraticule(mapInfo);
          })
          .catch(function (error) {
            that.errorCallback && that.errorCallback(error, 'getMapFaild', that.map);
          });
      } else {
        await that.addBaseMap(mapInfo);
        if (!mapInfo.layers || mapInfo.layers.length === 0) {
          that.sendMapToUser(0);
        } else {
          await that.addLayers(mapInfo);
        }
        that.addGraticule(mapInfo);
      }
    }
  }

  /**
   * 处理坐标系(底图)
   * @private
   * @param {string} crs 必传参数，值是webmap2中定义的坐标系，可能是 1、EGSG:xxx 2、WKT string
   * @param {string} baseLayerUrl  可选参数，地图的服务地址；用于EPSG：-1 的时候，用于请求iServer提供的wkt
   * @return {Object}
   */
  async handleCRS(crs, baseLayerUrl) {
    let that = this,
      handleResult = {};
    let newCrs = crs,
      action = 'OpenMap';

    if (this.isCustomProjection(crs)) {
      // 去iServer请求wkt  否则只能预览出图
      await FetchRequest.get(that.getRequestUrl(`${baseLayerUrl}/prjCoordSys.wkt`), null, {
        withCredentials: that.isCredentail(baseLayerUrl),
        withoutFormatSuffix: true
      })
        .then(function (response) {
          return response.text();
        })
        .then(async function (result) {
          if (result.indexOf('<!doctype html>') === -1) {
            that.addProjctionFromWKT(result, crs);
            handleResult = { action, newCrs };
          } else {
            throw 'ERROR';
          }
        })
        .catch(function () {
          action = 'BrowseMap';
          handleResult = { action, newCrs };
        });
    } else {
      if (crs.indexOf('EPSG') === 0 && crs.split(':')[1] <= 0) {
        // 自定义坐标系 rest map EPSG:-1(自定义坐标系) 支持编辑
        // 未知坐标系情况特殊处理，只支持预览 1、rest map EPSG:-1000(没定义坐标系)  2、wms/wmts EPSG:0 （自定义坐标系）
        action = 'BrowseMap';
      } else if (crs === 'EPSG:910111' || crs === 'EPSG:910112') {
        // 早期数据存在的自定义坐标系  "EPSG:910111": "GCJ02MERCATOR"， "EPSG:910112": "BDMERCATOR"
        newCrs = 'EPSG:3857';
      } else if (crs === 'EPSG:910101' || crs === 'EPSG:910102') {
        // 早期数据存在的自定义坐标系 "EPSG:910101": "GCJ02", "EPSG:910102": "BD",
        newCrs = 'EPSG:4326';
      } else if (crs.indexOf('EPSG') !== 0) {
        // wkt
        that.addProjctionFromWKT(newCrs);
        newCrs = that.getEpsgInfoFromWKT(crs);
      }
      handleResult = { action, newCrs };
    }
    return handleResult;
  }

  /**
   * @private
   * @function WebMap.prototype.getScales
   * @description 根据级别获取每个级别对应的分辨率
   * @param {Object} baseLayerInfo - 底图的图层信息
   */
  getScales(baseLayerInfo) {
    let scales = [],
      resolutions = {},
      res,
      scale,
      resolutionArray = [],
      coordUnit = baseLayerInfo.coordUnit || baseLayerInfo.units || olProj.get(baseLayerInfo.projection).getUnits();
    if (!coordUnit) {
      coordUnit = this.baseProjection == 'EPSG:3857' ? 'm' : 'degree';
    }
    if (baseLayerInfo.visibleScales && baseLayerInfo.visibleScales.length > 0) {
      //底部设置过固定比例尺，则使用设置的
      baseLayerInfo.visibleScales.forEach((scale) => {
        let value = 1 / scale;
        res = this.getResFromScale(value, coordUnit);
        scale = `1:${value}`;
        //多此一举转换，因为toLocalString会自动保留小数点后三位，and当第二位小数是0就会保存小数点后两位。所有为了统一。
        resolutions[this.formatScale(scale)] = res;
        resolutionArray.push(res);
        scales.push(scale);
      }, this);
    } else if (baseLayerInfo.layerType === 'WMTS') {
      baseLayerInfo.scales.forEach((scale) => {
        res = this.getResFromScale(scale, coordUnit, 90.7);
        scale = `1:${scale}`;
        //多此一举转换，因为toLocalString会自动保留小数点后三位，and当第二位小数是0就会保存小数点后两位。所有为了统一。
        resolutions[this.formatScale(scale)] = res;
        resolutionArray.push(res);
        scales.push(scale);
      }, this);
    } else if(baseLayerInfo.layerType === 'ZXY_TILE') {
      const { resolutions: visibleResolution } = baseLayerInfo;
      visibleResolution.forEach(result => {
        const currentScale = this.getScaleFromRes(result, coordUnit);
        resolutions[this.formatScale(currentScale)] = result;
        scales.push(currentScale);
      })
      resolutionArray = visibleResolution;
    } else {
      let { minZoom = 0, maxZoom = 22 } = baseLayerInfo,
        view = this.map.getView();
      for (let i = minZoom; i <= maxZoom; i++) {
        res = view.getResolutionForZoom(i);
        scale = this.getScaleFromRes(res, coordUnit);
        if (scales.indexOf(scale) === -1) {
          //不添加重复的比例尺
          scales.push(scale);
          let attr = scale.replace(/,/g, '');
          resolutions[attr] = res;
          resolutionArray.push(res);
        }
      }
    }
    this.scales = scales;
    this.resolutions = resolutions;
    this.resolutionArray = resolutionArray;
  }
  /**
   * @private
   * @function WebMap.prototype.getResFromScale
   * @description 将比例尺转换为分辨率
   * @param {number} scale - 比例尺
   * @param {string} coordUnit - 比例尺单位
   * @param {number} dpi
   */
  getResFromScale(scale, coordUnit = 'DEGREE', dpi = 96) {
    let mpu = metersPerUnit[coordUnit.toUpperCase()];
    return (scale * 0.0254) / dpi / mpu;
  }
  /**
   * @private
   * @function WebMap.prototype.getScaleFromRes
   * @description 将分辨率转换为比例尺
   * @param {number} resolution - 分辨率
   * @param {string} coordUnit - 比例尺单位
   * @param {number} dpi
   */
  getScaleFromRes(resolution, coordUnit = 'DEGREE', dpi = 96) {
    let scale,
      mpu = metersPerUnit[coordUnit.toUpperCase()];
    scale = (resolution * dpi * mpu) / 0.0254;
    return '1:' + scale;
  }
  /**
   * @private
   * @function WebMap.prototype.formatScale
   * @description 将有千位符的数字转为普通数字。例如：1,234 => 1234
   * @param {number} scale - 比例尺分母
   */
  formatScale(scale) {
    return scale.replace(/,/g, '');
  }
  /**
   * @private
   * @function WebMap.prototype.createSpecLayer
   * @description 创建坐标系为0和-1000的图层
   * @param {Object} mapInfo - 地图信息
   */
  createSpecLayer(mapInfo) {
    let me = this,
      baseLayerInfo = mapInfo.baseLayer,
      url = baseLayerInfo.url,
      baseLayerType = baseLayerInfo.layerType;
    let extent = [
      mapInfo.extent.leftBottom.x,
      mapInfo.extent.leftBottom.y,
      mapInfo.extent.rightTop.x,
      mapInfo.extent.rightTop.y
    ];
    let proj = new olProj.Projection({
      extent,
      units: 'm',
      code: 'EPSG:0'
    });
    olProj.addProjection(proj);
    let options = {
      center: mapInfo.center,
      level: 0
    };
    //添加view
    me.baseProjection = proj;
    let viewOptions = {
      center: options.center ? [options.center.x, options.center.y] : [0, 0],
      zoom: 0,
      projection: proj
    };
    if (['4', '5'].indexOf(Util.getOlVersion()) < 0) {
      // 兼容 ol 4，5，6
      viewOptions.multiWorld = true;
    }
    let view = new View(viewOptions);
    me.map.setView(view);
    if (me.mapParams) {
      me.mapParams.extent = extent;
      me.mapParams.projection = mapInfo.projection;
    }
    if (url && url.indexOf('?token=') > -1) {
      //兼容iserver地址有token的情况
      me.credentialKey = 'token';
      me.credentialValue = mapInfo.baseLayer.credential = url.split('?token=')[1];
      url = url.split('?token=')[0];
    }

    let source;
    if (baseLayerType === 'TILE') {
      url = this.handleJSONSuffix(url);
      FetchRequest.get(me.getRequestUrl(url), null, {
        withCredentials: me.isCredentail(url)
      })
        .then(function (response) {
          return response.json();
        })
        .then(function (result) {
          baseLayerInfo.originResult = result;
          let serverType = 'IPORTAL',
            credential = baseLayerInfo.credential,
            keyfix = 'Token',
            keyParams = baseLayerInfo.url;
          if (
            baseLayerInfo.url.indexOf('www.supermapol.com') > -1 ||
            baseLayerInfo.url.indexOf('itest.supermapol.com') > -1
          ) {
            keyfix = 'Key';
            keyParams = [keyParams];
            serverType = 'ONLINE';
          }
          if (credential) {
            SecurityManager[`register${keyfix}`](keyParams, credential);
          }
          let options = {
            serverType,
            url,
            tileGrid: TileSuperMapRest.optionsFromMapJSON(url, result).tileGrid,
            tileLoadFunction: me.getCustomTileLoadFunction()
          };
          if (url && this.isAddProxy(url)) {
            options.tileProxy = me.server + 'apps/viewer/getUrlResource.png?url=';
          }
          source = new TileSuperMapRest(options);
          me.addSpecToMap(source);
        })
        .catch(function (error) {
          me.errorCallback && me.errorCallback(error, 'getMapFaild', me.map);
        });
    } else if (baseLayerType === 'WMS') {
      source = me.createWMSSource(baseLayerInfo);
      me.addSpecToMap(source);
    } else if (baseLayerType === 'WMTS') {
      FetchRequest.get(me.getRequestUrl(url), null, {
        withCredentials: me.isCredentail(url)
      })
        .then(function (response) {
          return response.text();
        })
        .then(function (capabilitiesText) {
          baseLayerInfo.extent = [
            mapInfo.extent.leftBottom.x,
            mapInfo.extent.leftBottom.y,
            mapInfo.extent.rightTop.x,
            mapInfo.extent.rightTop.y
          ];
          baseLayerInfo.scales = me.getWMTSScales(baseLayerInfo.tileMatrixSet, capabilitiesText);
          baseLayerInfo.dpi = dpiConfig.iServerWMTS;
          source = me.createWMTSSource(baseLayerInfo);
          me.addSpecToMap(source);
        })
        .catch(function (error) {
          me.errorCallback && me.errorCallback(error, 'getMapFaild', me.map);
        });
    } else {
      me.errorCallback &&
        me.errorCallback(
          { type: 'Not support CS', errorMsg: `Not support CS: ${baseLayerType}` },
          'getMapFaild',
          me.map
        );
    }
    view && view.fit(extent);
  }

  /**
   * @private
   * @function WebMap.prototype.addSpecToMap
   * @description 将坐标系为0和-1000的图层添加到地图上
   * @param {Object} mapInfo - 地图信息
   */
  addSpecToMap(source) {
    let layer = new olLayer.Tile({
      source: source,
      zIndex: 0
    });
    this.map.addLayer(layer);
    this.sendMapToUser(0);
  }
  /**
   * @private
   * @function WebMap.prototype.getWMTSScales
   * @description 获取wmts的比例尺
   * @param {Object} identifier - 图层存储的标识信息
   * @param {Object} capabilitiesText - wmts信息
   */
  getWMTSScales(identifier, capabilitiesText) {
    const format = new WMTSCapabilities();
    let capabilities = format.read(capabilitiesText);

    let content = capabilities.Contents;
    let tileMatrixSet = content.TileMatrixSet;
    let scales = [];
    for (let i = 0; i < tileMatrixSet.length; i++) {
      if (tileMatrixSet[i].Identifier === identifier) {
        for (let h = 0; h < tileMatrixSet[i].TileMatrix.length; h++) {
          scales.push(tileMatrixSet[i].TileMatrix[h].ScaleDenominator);
        }
        break;
      }
    }
    return scales;
  }

  /**
   * @private
   * @function WebMap.prototype.addBaseMap
   * @description 添加底图
   * @param {string} mapInfo - 请求地图的url
   */
  async addBaseMap(mapInfo) {
    let { baseLayer } = mapInfo,
      layerType = baseLayer.layerType;
    //底图，使用默认的配置，不用存储的
    if (layerType !== 'TILE' && layerType !== 'WMS' && layerType !== 'WMTS') {
      this.getInternetMapInfo(baseLayer);
    } else if (layerType === 'WMTS') {
      // 通过请求完善信息
      await this.getWmtsInfo(baseLayer);
    } else if (layerType === 'TILE') {
      await this.getTileInfo(baseLayer);
    } else if (layerType === 'WMS') {
      await this.getWmsInfo(baseLayer);
    }
    baseLayer.projection = mapInfo.projection;
    if (!baseLayer.extent) {
      baseLayer.extent = [
        mapInfo.extent.leftBottom.x,
        mapInfo.extent.leftBottom.y,
        mapInfo.extent.rightTop.x,
        mapInfo.extent.rightTop.y
      ];
    }
    this.createView(mapInfo);
    let layer = this.createBaseLayer(baseLayer, 0, null, null, true);
    //底图增加图层类型，DV分享需要用它来识别版权信息
    layer.setProperties({
      layerType: layerType
    });
    this.map.addLayer(layer);

    if (this.mapParams) {
      this.mapParams.extent = baseLayer.extent;
      this.mapParams.projection = mapInfo.projection;
    }
    if (baseLayer.labelLayerVisible) {
      //存在天地图路网
      let labelLayer = new olLayer.Tile({
        source: this.createTiandituSource(baseLayer.layerType, mapInfo.projection, true),
        zIndex: baseLayer.zIndex || 1,
        visible: baseLayer.visible
      });
      this.map.addLayer(labelLayer);
      // 挂载带baseLayer上，便于删除
      baseLayer.labelLayer = labelLayer;
    }
    this.limitScale(mapInfo, baseLayer);
  }

  validScale(scale) {
    if (!scale) {
      return false;
    }
    const scaleNum = scale.split(':')[1];
    if (!scaleNum) {
      return false;
    }
    const res = 1 / +scaleNum;
    if (res === Infinity || res >= 1) {
      return false;
    }
    return true;
  }

  limitScale(mapInfo, baseLayer) {
    if (this.validScale(mapInfo.minScale) && this.validScale(mapInfo.maxScale)) {
      let visibleScales, minScale, maxScale;
      if (baseLayer.layerType === 'WMTS') {
        visibleScales = baseLayer.scales;
        minScale = +mapInfo.minScale.split(':')[1];
        maxScale = +mapInfo.maxScale.split(':')[1];
      } else {
        const scales = this.scales.map((scale) => {
          return 1 / scale.split(':')[1];
        });
        if (Array.isArray(baseLayer.visibleScales) && baseLayer.visibleScales.length && baseLayer.visibleScales) {
          visibleScales = baseLayer.visibleScales;
        } else {
          visibleScales = scales;
        }
        minScale = 1 / +mapInfo.minScale.split(':')[1];
        maxScale = 1 / +mapInfo.maxScale.split(':')[1];
      }
      const minVisibleScale = this.findNearest(visibleScales, minScale);
      const maxVisibleScale = this.findNearest(visibleScales, maxScale);
      let minZoom = visibleScales.indexOf(minVisibleScale);
      let maxZoom = visibleScales.indexOf(maxVisibleScale);
      if (minZoom > maxZoom) {
        [minZoom, maxZoom] = [maxZoom, minZoom];
      }
      if (minZoom !== 0 || maxZoom !== visibleScales.length - 1) {
        const oldViewOptions = this.map.getView().options_ || this.map.getView().getProperties();
        this.map.setView(
          new View(
            Object.assign({}, oldViewOptions, {
              maxResolution: undefined,
              minResolution: undefined,
              minZoom,
              maxZoom,
              constrainResolution: false
            })
          )
        );
        this.map.addInteraction(
          new MouseWheelZoom({
            constrainResolution: true
          })
        );
      }
    }
  }

  parseNumber(scaleStr) {
    return Number(scaleStr.split(':')[1]);
  }

  findNearest(scales, target) {
    let resultIndex = 0;
    let targetScaleD = target;
    for (let i = 1, len = scales.length; i < len; i++) {
      if (Math.abs(scales[i] - targetScaleD) < Math.abs(scales[resultIndex] - targetScaleD)) {
        resultIndex = i;
      }
    }
    return scales[resultIndex];
  }

  /**
   * @private
   * @function WebMap.prototype.addMVTMapLayer
   * @description 添加地图服务mapboxstyle图层
   * @param {Object} mapInfo - 地图信息
   * @param {Object} layerInfo - mapboxstyle图层信息
   */
  addMVTMapLayer(mapInfo, layerInfo, zIndex) {
    layerInfo.zIndex = zIndex;
    // 获取地图详细信息
    return this.getMapboxStyleLayerInfo(mapInfo, layerInfo)
      .then((msLayerInfo) => {
        // 创建图层
        return this.createMVTLayer(msLayerInfo).then((layer) => {
          let layerID = Util.newGuid(8);
          if (layerInfo.name) {
            layer.setProperties({
              name: layerInfo.name,
              layerID: layerID,
              layerType: 'VECTOR_TILE'
            });
          }
          layerInfo.visibleScale && this.setVisibleScales(layer, layerInfo.visibleScale);
          //否则没有ID，对不上号
          layerInfo.layer = layer;
          layerInfo.layerID = layerID;

          this.map.addLayer(layer);
        });
      })
      .catch(function (error) {
        throw error;
      });
  }
  /**
   * @private
   * @function WebMap.prototype.createView
   * @description 创建地图视图
   * @param {Object} options - 关于地图的信息
   */
  createView(options) {
    let oldcenter = options.center,
      zoom = options.level !== undefined ? options.level : 1,
      maxZoom = options.maxZoom || 22,
      extent,
      projection = this.baseProjection;
    let center = [];
    for (let key in oldcenter) {
      center.push(oldcenter[key]);
    }
    if (center.length === 0) {
      //兼容wms
      center = [0, 0];
    }
    //与DV一致用底图的默认范围，不用存储的范围。否则会导致地图拖不动
    this.baseLayerExtent = extent = options.baseLayer && options.baseLayer.extent;
    if (this.mapParams) {
      this.mapParams.extent = extent;
      this.mapParams.projection = projection;
    }
    //当前中心点不在extent内,就用extent的中心点 todo
    !containsCoordinate(extent, center) && (center = getCenter(extent));

    // 计算当前最大分辨率
    let baseLayer = options.baseLayer;
    let maxResolution;
    if (
      (baseLayer.visibleScales && baseLayer.visibleScales.length > 0) ||
      (baseLayer.scales && baseLayer.scales.length > 0)
    ) {
      //底图有固定比例尺，就直接获取。不用view计算
      this.getScales(baseLayer);
    } else if (baseLayer && baseLayer.layerType !=="ZXY_TILE" && extent && extent.length === 4) {
      let width = extent[2] - extent[0];
      let height = extent[3] - extent[1];
      let maxResolution1 = width / 512;
      let maxResolution2 = height / 512;
      maxResolution = Math.max(maxResolution1, maxResolution2);
    }

    // if(options.baseLayer.visibleScales && options.baseLayer.visibleScales.length > 0){
    //     maxZoom = options.baseLayer.visibleScales.length;
    // }
    this.map.setView(new View({ zoom, center, projection, maxZoom, maxResolution }));
    let viewOptions = {};

    if (baseLayer.layerType === "ZXY_TILE") {
      const { resolutions, minZoom, maxZoom } = baseLayer;
      viewOptions = { minZoom, maxZoom, zoom, center, projection, resolutions};
      this.getScales(baseLayer);
    } else if (
      (baseLayer.scales && baseLayer.scales.length > 0 && baseLayer.layerType === 'WMTS') ||
      (this.resolutionArray && this.resolutionArray.length > 0)
    ) {
      viewOptions = { zoom, center, projection, resolutions: this.resolutionArray, maxZoom };
    } else if (baseLayer.layerType === 'WMTS') {
      viewOptions = { zoom, center, projection, maxZoom };
      this.getScales(baseLayer);
    } else {
      viewOptions = { zoom, center, projection, maxResolution, maxZoom };
      this.getScales(baseLayer);
    }
    if (['4', '5'].indexOf(Util.getOlVersion()) < 0) {
      // 兼容 ol 4，5，6
      viewOptions.multiWorld = true;
      viewOptions.showFullExtent = true;
      viewOptions.enableRotation = false;
      viewOptions.constrainResolution = true; //设置此参数，是因为需要显示整数级别。为了可视比例尺中包含当前比例尺
    }
    this.map.setView(new View(viewOptions));

    if (options.visibleExtent) {
      const view = this.map.getView();
      const resolution = view.getResolutionForExtent(options.visibleExtent, this.map.getSize());
      view.setResolution(resolution);
      view.setCenter(getCenter(options.visibleExtent));
    }
  }
  /**
   * @private
   * @function WebMap.prototype.createBaseLayer
   * @description 创建矢量图层，包括底图及其叠加的矢量图层
   * @param {Object} layerInfo - 关于地图的信息
   * @param {number} index - 当前图层在地图中的index
   * @param {boolean} isCallBack - 是否调用回调函数
   * @param {scope} {Object} this对象
   */
  createBaseLayer(layerInfo, index, isCallBack, scope, isBaseLayer) {
    let source,
      that = this;

    if (scope) {
      // 解决异步回调
      that = scope;
    }
    let layerType = layerInfo.layerType; //底图和rest地图兼容
    if (
      layerType.indexOf('TIANDITU_VEC') > -1 ||
      layerType.indexOf('TIANDITU_IMG') > -1 ||
      layerType.indexOf('TIANDITU_TER') > -1
    ) {
      layerType = layerType.substr(0, 12);
    }
    switch (layerType) {
      case 'TIANDITU_VEC':
      case 'TIANDITU_IMG':
      case 'TIANDITU_TER':
        source = this.createTiandituSource(layerType, layerInfo.projection);
        break;
      case 'BAIDU':
        source = this.createBaiduSource();
        break;
      case 'BING':
        source = this.createBingSource();
        break;
      case 'WMS':
        source = this.createWMSSource(layerInfo);
        break;
      case 'WMTS':
        source = that.createWMTSSource(layerInfo);
        break;
      case 'TILE':
      case 'SUPERMAP_REST':
        source = that.createDynamicTiledSource(layerInfo, isBaseLayer);
        break;
      case 'ZXY_TILE':
        source = this.createXYZTileSource(layerInfo);
        break;
      case 'CLOUD':
      case 'CLOUD_BLACK':
      case 'OSM':
      case 'JAPAN_ORT':
      case 'JAPAN_RELIEF':
      case 'JAPAN_PALE':
      case 'JAPAN_STD':
      case 'GOOGLE_CN':
      case 'GOOGLE':
        source = this.createXYZSource(layerInfo);
        break;
      default:
        break;
    }
    var layer = new olLayer.Tile({
      source: source,
      zIndex: layerInfo.zIndex || 1,
      visible: layerInfo.visible,
      ...this.getLayerOtherOptions(layerInfo)
    });
    var layerID = Util.newGuid(8);
    if (layerInfo.name) {
      layer.setProperties({
        name: layerInfo.name,
        layerID: layerID
      });
    }
    if (layerInfo.visible === undefined || layerInfo.visible === null) {
      layerInfo.visible = true;
    }
    layer.setVisible(layerInfo.visible);
    layerInfo.opacity && layer.setOpacity(layerInfo.opacity);
    //layerInfo没有存储index属性
    index && layer.setZIndex(index);

    //否则没有ID，对不上号
    layerInfo.layer = layer;
    layerInfo.layerID = layerID;

    let { visibleScale, autoUpdateTime } = layerInfo,
      minResolution,
      maxResolution;
    if (visibleScale) {
      maxResolution = this.resolutions[visibleScale.minScale];
      minResolution = this.resolutions[visibleScale.maxScale];
      //比例尺和分别率是反比的关系
      maxResolution > 1
        ? layer.setMaxResolution(Math.ceil(maxResolution))
        : layer.setMaxResolution(maxResolution * 1.1);
      layer.setMinResolution(minResolution);
    }
    if (autoUpdateTime && !layerInfo.autoUpdateInterval) {
      //自动更新
      layerInfo.autoUpdateInterval = setInterval(() => {
        that.updateTileToMap(layerInfo, index);
      }, autoUpdateTime);
    }

    if (isCallBack) {
      layer.setZIndex(0); // wmts
      that.map.addLayer(layer);
    }

    return layer;
  }

  /**
   * @private
   * @function WebMap.prototype.updateTileToMap
   * @description 获取底图对应的图层信息，不是用请求回来的底图信息
   * @param {Object} layerInfo - 图层信息
   * @param {number} layerIndex - 图层index
   */
  updateTileToMap(layerInfo, layerIndex) {
    this.map.removeLayer(layerInfo.layer);
    this.map.addLayer(this.createBaseLayer(layerInfo, layerIndex));
  }

  /**
   * @private
   * @function WebMap.prototype.getInternetMapInfo
   * @description 获取底图对应的图层信息，不是用请求回来的底图信息
   * @param {Object} baseLayerInfo - 底图信息
   * @returns {Object} 底图的具体信息
   */
  getInternetMapInfo(baseLayerInfo) {
    const baiduBounds = [-20037508.3427892, -20037508.3427892, 20037508.3427892, 20037508.3427892];
    const bounds_4326 = [-180, -90, 180, 90];
    const osmBounds = [-20037508.34, -20037508.34, 20037508.34, 20037508.34];
    const japanReliefBounds = [12555667.53929, 1281852.98656, 17525908.86651, 7484870.70596];
    const japanOrtBounds = [-19741117.14519, -10003921.36848, 19981677.71404, 19660983.56089];

    baseLayerInfo.units = 'm';
    switch (baseLayerInfo.layerType) {
      case 'BAIDU':
        baseLayerInfo.iServerUrl = 'https://map.baidu.com/';
        baseLayerInfo.epsgCode = 'EPSG:3857';
        baseLayerInfo.minZoom = 1;
        baseLayerInfo.maxZoom = 19;
        baseLayerInfo.level = 1;
        baseLayerInfo.extent = baiduBounds;
        // thumbnail: this.getImagePath('bmap.png') 暂时不用到缩略图
        break;
      case 'CLOUD':
        baseLayerInfo.url = 'http://t2.dituhui.com/FileService/image?map=quanguo&type=web&x={x}&y={y}&z={z}';
        baseLayerInfo.epsgCode = 'EPSG:3857';
        baseLayerInfo.minZoom = 1;
        baseLayerInfo.maxZoom = 18;
        baseLayerInfo.level = 1;
        baseLayerInfo.extent = baiduBounds;
        break;
      case 'CLOUD_BLACK':
        baseLayerInfo.url = 'http://t3.dituhui.com/MapService/getGdp?x={x}&y={y}&z={z}';
        baseLayerInfo.epsgCode = 'EPSG:3857';
        baseLayerInfo.minZoom = 1;
        baseLayerInfo.maxZoom = 18;
        baseLayerInfo.level = 1;
        baseLayerInfo.extent = baiduBounds;
        break;
      case 'tencent':
        baseLayerInfo.epsgCode = 'EPSG:3857';
        baseLayerInfo.minZoom = 1;
        baseLayerInfo.maxZoom = 18;
        baseLayerInfo.level = 1;
        baseLayerInfo.extent = baiduBounds;
        break;
      case 'TIANDITU_VEC_3857':
      case 'TIANDITU_IMG_3857':
      case 'TIANDITU_TER_3857':
        baseLayerInfo.iserverUrl = 'https://map.tianditu.gov.cn/';
        baseLayerInfo.epsgCode = 'EPSG:3857';
        baseLayerInfo.minZoom = 0;
        baseLayerInfo.maxZoom = 19;
        baseLayerInfo.level = 1;
        baseLayerInfo.extent = baiduBounds;
        if (baseLayerInfo.layerType === 'TIANDITU_TER_3857') {
          baseLayerInfo.maxZoom = 14;
        }
        break;
      case 'TIANDITU_VEC_4326':
      case 'TIANDITU_IMG_4326':
      case 'TIANDITU_TER_4326':
        baseLayerInfo.iserverUrl = 'https://map.tianditu.gov.cn/';
        baseLayerInfo.epsgCode = 'EPSG:4326';
        baseLayerInfo.minZoom = 0;
        baseLayerInfo.maxZoom = 19;
        baseLayerInfo.level = 1;
        baseLayerInfo.extent = bounds_4326;
        if (baseLayerInfo.layerType === 'TIANDITU_TER_4326') {
          baseLayerInfo.maxZoom = 14;
        }
        break;
      case 'OSM':
        baseLayerInfo.url = 'http://{a-c}.tile.openstreetmap.org/{z}/{x}/{y}.png';
        baseLayerInfo.epsgCode = 'EPSG:3857';
        baseLayerInfo.minZoom = 1;
        baseLayerInfo.maxZoom = 19;
        baseLayerInfo.level = 1;
        baseLayerInfo.extent = osmBounds;
        baseLayerInfo.iserverUrl = 'https://www.openstreetmap.org';
        break;
      case 'GOOGLE':
        baseLayerInfo.url = `https://maps.googleapis.com/maps/vt?pb=!1m5!1m4!1i{z}!2i{x}!3i{y}!4i256!2m3!1e0!2sm!3i540264686!3m12!2s${this.getLang()}!3sUS!5e18!12m4!1e68!2m2!1sset!2sRoadmap!12m3!1e37!2m1!1ssmartmaps!4e0&key=${
          this.googleMapsAPIKey
        }`;
        baseLayerInfo.epsgCode = 'EPSG:3857';
        baseLayerInfo.minZoom = 1;
        baseLayerInfo.maxZoom = 22;
        baseLayerInfo.level = 1;
        baseLayerInfo.extent = osmBounds;
        baseLayerInfo.iserverUrl = 'https://www.google.cn/maps';
        break;
      case 'JAPAN_STD':
        baseLayerInfo.url = 'https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png';
        baseLayerInfo.epsgCode = 'EPSG:3857';
        baseLayerInfo.minZoom = 1;
        baseLayerInfo.maxZoom = 19;
        baseLayerInfo.level = 0;
        baseLayerInfo.extent = osmBounds;
        break;
      case 'JAPAN_PALE':
        baseLayerInfo.url = 'https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png';
        baseLayerInfo.epsgCode = 'EPSG:3857';
        baseLayerInfo.minZoom = 2;
        baseLayerInfo.maxZoom = 19;
        baseLayerInfo.level = 2;
        baseLayerInfo.extent = osmBounds;
        break;
      case 'JAPAN_RELIEF':
        baseLayerInfo.url = 'https://cyberjapandata.gsi.go.jp/xyz/relief/{z}/{x}/{y}.png';
        baseLayerInfo.epsgCode = 'EPSG:3857';
        baseLayerInfo.minZoom = 5;
        baseLayerInfo.maxZoom = 14;
        baseLayerInfo.level = 5;
        baseLayerInfo.extent = japanReliefBounds;
        break;
      case 'JAPAN_ORT':
        baseLayerInfo.url = 'https://cyberjapandata.gsi.go.jp/xyz/ort/{z}/{x}/{y}.jpg';
        baseLayerInfo.epsgCode = 'EPSG:3857';
        baseLayerInfo.minZoom = 2;
        baseLayerInfo.maxZoom = 12;
        baseLayerInfo.level = 2;
        baseLayerInfo.extent = japanOrtBounds;
        break;
    }
  }

  getCustomTileLoadFunction(transformImageUrl) {
    const that = this;
    if (this.tileRequestParameters) {
      return function(imageTile, url) {
        const src = transformImageUrl ? transformImageUrl(url) : url;
        const requestParameters = that.tileRequestParameters(src);
        if (requestParameters) {
          FetchRequest.get(src, null, {
            ...requestParameters,
            withoutFormatSuffix: true
          })
            .then(function (response) {
              return response.blob();
            })
            .then(function (blob) {
              const imageUrl = URL.createObjectURL(blob);
              imageTile.getImage().src = imageUrl;
            })
            .catch(function (error) {
              console.error('Error fetching the image:', error);
              imageTile.setState('error');
            });
        } else {
          imageTile.getImage().src = src;
        }
      }
    }
    if(transformImageUrl) {
      return function(imageTile, url) {
        const src = transformImageUrl(url);
        imageTile.getImage().src = src;
      }
    }
  }

  /**
   * @private
   * @function WebMap.prototype.createDynamicTiledSource
   * @description 获取supermap iServer类型的地图的source。
   * @param {Object} layerInfo
   * @param {boolean} isBaseLayer 是否是底图
   */
  createDynamicTiledSource(layerInfo, isBaseLayer) {
    let serverType = 'IPORTAL',
      credential = layerInfo.credential ? layerInfo.credential.token : undefined,
      keyfix = 'Token',
      keyParams = layerInfo.url;

    if (layerInfo.url.indexOf('www.supermapol.com') > -1 || layerInfo.url.indexOf('itest.supermapol.com') > -1) {
      keyfix = 'Key';
      keyParams = [keyParams];
      serverType = 'ONLINE';
    }
    if (credential) {
      SecurityManager[`register${keyfix}`](keyParams, credential);
    }
    // extent: isBaseLayer ? layerInfo.extent : ol.proj.transformExtent(layerInfo.extent, layerInfo.projection, this.baseProjection),
    let options = {
      transparent: true,
      url: layerInfo.url,
      wrapX: false,
      serverType: serverType,
      // crossOrigin: 'anonymous', //在IE11.0.9600版本，会影响通过注册服务打开的iserver地图，不出图。因为没有携带cookie会报跨域问题
      // extent: this.baseLayerExtent,
      // prjCoordSys: {epsgCode: isBaseLayer ? layerInfo.projection.split(':')[1] : this.baseProjection.split(':')[1]},
      format: layerInfo.format,
      tileLoadFunction: this.getCustomTileLoadFunction()
    };
    if (!isBaseLayer && !this.isCustomProjection(this.baseProjection)) {
      options.prjCoordSys = { epsgCode: this.baseProjection.split(':')[1] };
    }
    if (layerInfo.visibleScales && layerInfo.visibleScales.length > 0) {
      let visibleResolutions = [];
      for (let i in layerInfo.visibleScales) {
        let resolution = Util.scaleToResolution(layerInfo.visibleScales[i], dpiConfig.default, layerInfo.coordUnit);
        visibleResolutions.push(resolution);
      }
      layerInfo.visibleResolutions = visibleResolutions;
      let tileGrid = new TileGrid({
        extent: layerInfo.extent,
        resolutions: visibleResolutions
      });
      options.tileGrid = tileGrid;
    } else {
      options.extent = this.baseLayerExtent;
      //bug:ISVJ-2412,不添加下列代码出不了图。参照iserver ol3出图方式
      let tileGrid = new TileGrid({
        extent: layerInfo.extent,
        resolutions: this.getResolutionsFromBounds(layerInfo.extent)
      });
      options.tileGrid = tileGrid;
    }
    //主机名相同时不添加代理,iportal geturlResource不支持webp代理
    if (
      layerInfo.url &&
      layerInfo.format !== 'webp' && 
      this.isAddProxy(layerInfo.url, layerInfo.proxy)
    ) {
      options.tileProxy = this.server + 'apps/viewer/getUrlResource.png?url=';
    }
    let source = new TileSuperMapRest(options);
    SecurityManager[`register${keyfix}`](layerInfo.url);
    return source;
  }

  /**
   * @private
   * @function WebMap.prototype.getResolutionsFromBounds
   * @description 获取比例尺数组
   * @param {Array.<number>} bounds 范围数组
   * @returns {styleResolutions} 比例尺数组
   */
  getResolutionsFromBounds(bounds) {
    let styleResolutions = [];
    let temp = Math.abs(bounds[0] - bounds[2]) / 512;
    for (let i = 0; i < 22; i++) {
      if (i === 0) {
        styleResolutions[i] = temp;
        continue;
      }
      temp = temp / 2;
      styleResolutions[i] = temp;
    }
    return styleResolutions;
  }

  /**
   * @private
   * @function WebMap.prototype.createTiandituSource
   * @description 创建天地图的source。
   * @param layerType 图层类型
   * @param projection 地理坐标系
   * @param isLabel  是否有路网图层
   * @returns {Tianditu} 天地图的source
   */
  createTiandituSource(layerType, projection, isLabel) {
    let options = {
      layerType: layerType.split('_')[1].toLowerCase(),
      isLabel: isLabel || false,
      projection: projection,
      url: `https://t{0-7}.tianditu.gov.cn/{layer}_{proj}/wmts?tk=${this.tiandituKey}`
    };
    return new Tianditu(options);
  }
  /**
   * @private
   * @function WebMap.prototype.createBaiduSource
   * @description 创建百度地图的source。
   * @returns {BaiduMap} baidu地图的source
   */
  createBaiduSource() {
    return new BaiduMap();
  }
  /**
   * @private
   * @function WebMap.prototype.createBingSource
   * @description 创建bing地图的source。
   * @returns {ol.source.BingMaps} bing地图的source
   */
  createBingSource() {
    return new BingMaps({
      key: this.bingMapsKey,
      imagerySet: 'RoadOnDemand',
      culture: 'zh-cn',
      wrapX: false
    });
  }

  /**
   * @private
   * @function WebMap.prototype.createXYZSource
   * @description 创建图层的XYZsource。
   * @param {Object} layerInfo - 图层信息
   * @returns {ol.source.XYZ} xyz的source
   */
  createXYZSource(layerInfo) {
    return new XYZ({
      url: layerInfo.url,
      wrapX: false,
      crossOrigin: 'anonymous',
      tileLoadFunction: this.getCustomTileLoadFunction()
    });
  }

  getLayerOtherOptions(layerInfo) {
    const { layerType, extent, minZoom, maxZoom } = layerInfo;
    const extentVal = layerType === 'ZXY_TILE' ? this._getZXYTileMapBounds(layerInfo) : extent;
    const options = { extent: extentVal };
    if (typeof minZoom === 'number' && minZoom !== 0) {
      options.minZoom = minZoom - 1;
    }
    if (typeof maxZoom === 'number') {
      options.maxZoom = maxZoom;
    }
    return options;
  }
  _getZXYTileMapBounds(layerInfo) {
    const { mapBounds, tileSize = 256, resolutions, origin } = layerInfo;
    if (mapBounds) {
      return mapBounds;
    }
    if (resolutions) {
      const maxResolution = resolutions.sort((a, b) => b - a)[0];
      const size = maxResolution * tileSize;
      return [origin[0], origin[1] - size, origin[0] + size, origin[1]];
    }
    // 兼容之前的3857全球剖分
    if (this.baseProjection == 'EPSG:3857') {
      return [-20037508.3427892, -20037508.3427892, 20037508.3427892, 20037508.3427892];
    }
  }
  /**
   * @private
   * @function WebMap.prototype.createXYZTileSource
   * @description 创建图层的XYZTilesource。
   * @param {Object} layerInfo - 图层信息
   * @returns {ol.source.XYZ} xyz的source
   */
  createXYZTileSource(layerInfo) {
    const { url, subdomains, origin, resolutions, tileSize } = layerInfo;
    const urls = subdomains && subdomains.length ? subdomains.map((item) => url.replace('{s}', item)) : [url];
    const options = {
      urls,
      wrapX: false,
      crossOrigin: 'anonymous',
      tileGrid: this._getTileGrid({ origin, resolutions, tileSize }),
      projection: this.baseProjection,
      tileLoadFunction: this.getCustomTileLoadFunction()
    };
    return new XYZ(options);
  }
  _getTileGrid({ origin, resolutions, tileSize }) {
    if (origin === undefined && resolutions === undefined) {
      // 兼容上一版webMercator全球剖分
      const extent = [-20037508.3427892, -20037508.3427892, 20037508.3427892, 20037508.3427892];
      return olTilegrid.createXYZ({ extent });
    } else {
      return new TileGrid({ origin, resolutions, tileSize });
    }
  }
  /**
   * @private
   * @function WebMap.prototype.createWMSSource
   * @description 创建wms地图source。
   * @param {Object} layerInfo - 图层信息。
   * @returns {ol.source.TileWMS} wms的source
   */
  createWMSSource(layerInfo) {
    let that = this;
    return new TileWMS({
      url: layerInfo.url,
      wrapX: false,
      params: {
        LAYERS: layerInfo.layers ? layerInfo.layers[0] : '0',
        FORMAT: 'image/png',
        VERSION: layerInfo.version || '1.3.0'
      },
      projection: layerInfo.projection || that.baseProjection,
      tileLoadFunction: this.getCustomTileLoadFunction((src) => {
        return that.isAddProxy(src, layerInfo.proxy) ? `${that.getProxy('png')}${encodeURIComponent(src)}`: src;
      })
    });
  }

  /**
   * @private
   * @function WebMap.prototype.getTileLayerExtent
   * @description 获取(Supermap RestMap)的图层参数。
   * @param {Object} layerInfo - 图层信息。
   * @param {function} callback - 获得tile图层参数执行的回调函数
   * @param {function} failedCallback - 失败回调函数
   */
  async getTileLayerExtent(layerInfo, callback, failedCallback) {
    let that = this;
    // 默认使用动态投影方式请求数据
    let dynamicLayerInfo = await that.getTileLayerExtentInfo(layerInfo);
    if (dynamicLayerInfo.succeed === false) {
      if (dynamicLayerInfo.error.code === 400) {
        // dynamicLayerInfo.error.code === 400 不支持动态投影，请求restmap原始信息
        let originLayerInfo = await that.getTileLayerExtentInfo(layerInfo, false);
        if (originLayerInfo.succeed === false) {
          failedCallback();
        } else {
          Object.assign(layerInfo, originLayerInfo);
          callback(layerInfo);
        }
      } else {
        failedCallback();
      }
    } else {
      Object.assign(layerInfo, dynamicLayerInfo);
      callback(layerInfo);
    }
  }

  /**
   * @private
   * @function WebMap.prototype.getTileLayerExtentInfo
   * @description 获取rest map的图层参数。
   * @param {Object} layerInfo - 图层信息。
   * @param {boolean} isDynamic - 是否请求动态投影信息
   */
  getTileLayerExtentInfo(layerInfo, isDynamic = true) {
    let that = this,
      token,
      url = layerInfo.url.trim(),
      credential = layerInfo.credential,
      options = {
        withCredentials: that.isCredentail(url, layerInfo.proxy),
        withoutFormatSuffix: true
      };
    if (isDynamic) {
      let projection = {
        epsgCode: that.baseProjection.split(':')[1]
      };
      if (!that.isCustomProjection(that.baseProjection)) {
        // bug IE11 不会自动编码
        url += '.json?prjCoordSys=' + encodeURI(JSON.stringify(projection));
      }
    }
    if (credential) {
      url = `${url}&token=${encodeURI(credential.token)}`;
      token = credential.token;
    }
    url = this.handleJSONSuffix(url);
    return FetchRequest.get(that.getRequestUrl(url, layerInfo.proxy), null, options)
      .then(function (response) {
        return response.json();
      })
      .then(async (result) => {
        if (result.succeed === false) {
          return result;
        }
        let format = 'png';
        if (that.tileFormat === 'webp') {
          const isSupportWebp = await that.isSupportWebp(layerInfo.url, token, layerInfo.proxy);
          format = isSupportWebp ? 'webp' : 'png';
        }
        return {
          units: result.coordUnit && result.coordUnit.toLowerCase(),
          coordUnit: result.coordUnit,
          visibleScales: result.visibleScales,
          extent: [result.bounds.left, result.bounds.bottom, result.bounds.right, result.bounds.top],
          projection: `EPSG:${result.prjCoordSys.epsgCode}`,
          format
        };
      })
      .catch((error) => {
        return {
          succeed: false,
          error: error
        };
      });
  }

  /**
   * @private
   * @function WebMap.prototype.getTileInfo
   * @description 获取rest map的图层参数。
   * @param {Object} layerInfo - 图层信息。
   * @param {function} callback - 获得wmts图层参数执行的回调函数
   */
  getTileInfo(layerInfo, callback, mapInfo) {
    let that = this;
    let options = {
      withCredentials: that.isCredentail(layerInfo.url, layerInfo.proxy),
      withoutFormatSuffix: true
    };
    let tempUrl = layerInfo.url;
    if (layerInfo.url.indexOf('?token=') > -1) {
      layerInfo.credential = { token: layerInfo.url.split('?token=')[1] };
      layerInfo.url = layerInfo.url.split('?token=')[0];
    }
    let url = this.handleJSONSuffix(tempUrl);
    return FetchRequest.get(that.getRequestUrl(url, layerInfo.proxy), null, options)
      .then(function (response) {
        return response.json();
      })
      .then(async function (result) {
        // layerInfo.projection = mapInfo.projection;
        // layerInfo.extent = [mapInfo.extent.leftBottom.x, mapInfo.extent.leftBottom.y, mapInfo.extent.rightTop.x, mapInfo.extent.rightTop.y];
        // 比例尺 单位
        if (result && result.code && result.code !== 200) {
          throw result;
        }
        if (result.visibleScales) {
          layerInfo.visibleScales = result.visibleScales;
          layerInfo.coordUnit = result.coordUnit;
        }
        layerInfo.maxZoom = result.maxZoom;
        layerInfo.maxZoom = result.minZoom;
        let token = layerInfo.credential ? layerInfo.credential.token : undefined;
        layerInfo.format = 'png';
        // china_dark为默认底图，还是用png出图
        if (
          that.tileFormat === 'webp' &&
          layerInfo.url !== 'https://maptiles.supermapol.com/iserver/services/map_China/rest/maps/China_Dark'
        ) {
          const isSupprtWebp = await that.isSupportWebp(layerInfo.url, token, layerInfo.proxy);
          layerInfo.format = isSupprtWebp ? 'webp' : 'png';
        }
        // 请求结果完成 继续添加图层
        if (mapInfo) {
          //todo 这个貌似没有用到，下次优化
          callback && callback(mapInfo, null, true, that);
        } else {
          callback && callback(layerInfo);
        }
      })
      .catch(function (error) {
        that.errorCallback && that.errorCallback(error, 'getTileInfo', that.map);
      });
  }
  /**
   * @private
   * @function WebMap.prototype.getWMTSUrl
   * @description 获取wmts请求文档的url
   * @param {string} url - 图层信息。
   * @param {boolean} isKvp - 是否为kvp模式
   * @param {boolean} proxy - 是否带上代理地址 
   */
  getWMTSUrl(url, isKvp, proxy) {
    let splitStr = '?';
    if (url.indexOf('?') > -1) {
      splitStr = '&';
    }
    if (isKvp) {
      url += splitStr + 'SERVICE=WMTS&VERSION=1.0.0&REQUEST=GetCapabilities';
    } else {
      url += splitStr + '/1.0.0/WMTSCapabilities.xml';
    }
    return this.getRequestUrl(url, proxy);
  }

  /**
   * @private
   * @function WebMap.prototype.getWmtsInfo
   * @description 获取wmts的图层参数。
   * @param {Object} layerInfo - 图层信息。
   * @param {function} callback - 获得wmts图层参数执行的回调函数
   */
  getWmtsInfo(layerInfo, callback) {
    let that = this;
    let options = {
      withCredentials: that.isCredentail(layerInfo.url, layerInfo.proxy), 
      withoutFormatSuffix: true
    };
    const isKvp = !layerInfo.requestEncoding || layerInfo.requestEncoding === 'KVP';
    return FetchRequest.get(that.getWMTSUrl(layerInfo.url, isKvp, layerInfo.proxy), null, options)
      .then(function (response) {
        return response.text();
      })
      .then(function (capabilitiesText) {
        const format = new WMTSCapabilities();
        let capabilities = format.read(capabilitiesText);
        if (that.isValidResponse(capabilities)) {
          let content = capabilities.Contents;
          let tileMatrixSet = content.TileMatrixSet,
            layers = content.Layer,
            layer,
            idx,
            layerFormat,
            style = 'default';

          for (let n = 0; n < layers.length; n++) {
            if (layers[n].Identifier === layerInfo.layer) {
              idx = n;
              layer = layers[idx];
              layerFormat = layer.Format[0];
              var layerBounds = layer.WGS84BoundingBox;
              // tileMatrixSetLink = layer.TileMatrixSetLink;
              break;
            }
          }
          layer &&
            layer.Style &&
            layer.Style.forEach((value) => {
              if (value.isDefault) {
                style = value.Identifier;
              }
            });
          let scales = [],
            matrixIds = [];
          for (let i = 0; i < tileMatrixSet.length; i++) {
            if (tileMatrixSet[i].Identifier === layerInfo.tileMatrixSet) {
              let wmtsLayerEpsg = `EPSG:${tileMatrixSet[i].SupportedCRS.split('::')[1]}`;
              for (let h = 0; h < tileMatrixSet[i].TileMatrix.length; h++) {
                scales.push(tileMatrixSet[i].TileMatrix[h].ScaleDenominator);
                matrixIds.push(tileMatrixSet[i].TileMatrix[h].Identifier);
              }
              //bug wmts出图需要加上origin，否则会出现出图不正确的情况。偏移或者瓦片出不了
              let origin = tileMatrixSet[i].TileMatrix[0].TopLeftCorner;
              layerInfo.origin =
                ['EPSG:4326', 'EPSG:4490'].indexOf(wmtsLayerEpsg) > -1 ? [origin[1], origin[0]] : origin;
              break;
            }
          }
          let name = layerInfo.name,
            extent;
          if (layerBounds) {
            if (layerBounds[0] < -180) {
              layerBounds[0] = -180;
            }
            if (layerBounds[1] < -90) {
              layerBounds[1] = -90;
            }
            if (layerBounds[2] > 180) {
              layerBounds[2] = 180;
            }
            if (layerBounds[3] > 90) {
              layerBounds[3] = 90;
            }
            extent = olProj.transformExtent(layerBounds, 'EPSG:4326', that.baseProjection);
          } else {
            extent = olProj.get(that.baseProjection).getExtent();
          }
          layerInfo.tileUrl = that.getTileUrl(
            capabilities.OperationsMetadata.GetTile.DCP.HTTP.Get,
            layer,
            layerFormat,
            isKvp
          );
          //将需要的参数补上
          layerInfo.extent = extent;
          layerInfo.name = name;
          layerInfo.orginEpsgCode = layerInfo.projection;
          layerInfo.overLayer = true;
          layerInfo.scales = scales;
          layerInfo.style = style;
          layerInfo.title = name;
          layerInfo.unit = 'm';
          layerInfo.layerFormat = layerFormat;
          layerInfo.matrixIds = matrixIds;
          callback && callback(layerInfo);
        }
      })
      .catch(function (error) {
        that.errorCallback && that.errorCallback(error, 'getWmtsFaild', that.map);
      });
  }
  /**
   * @private
   * @function WebMap.prototype.getWmsInfo
   * @description 获取wms的图层参数。
   * @param {Object} layerInfo - 图层信息。
   */
  getWmsInfo(layerInfo) {
    let that = this;
    let url = layerInfo.url.trim();
    url += url.indexOf('?') > -1 ? '&SERVICE=WMS&REQUEST=GetCapabilities' : '?SERVICE=WMS&REQUEST=GetCapabilities';
    let options = {
      withCredentials: that.isCredentail(url, layerInfo.proxy),
      withoutFormatSuffix: true
    };

    let promise = new Promise(function (resolve) {
      return FetchRequest.get(that.getRequestUrl(url, layerInfo.proxy), null, options)
        .then(function (response) {
          return response.text();
        })
        .then(async function (capabilitiesText) {
          const format = new WMSCapabilities();
          let capabilities = format.read(capabilitiesText);
          if (capabilities) {
            let layers = capabilities.Capability.Layer.Layer,
              proj = layerInfo.projection;
            layerInfo.subLayers = layerInfo.layers[0];
            layerInfo.version = capabilities.version;
            for (let i = 0; i < layers.length; i++) {
              // 图层名比对
              if (layerInfo.layers[0] === layers[i].name) {
                let layer = layers[i];
                if (layer.bbox[proj]) {
                  let bbox = layer.bbox[proj].bbox;
                  // wmts 130 坐标轴是否反向，目前还无法判断
                  // 后续还需继续完善WKT 增加坐标轴方向值
                  // 目前wkt信息 来自https://epsg.io/
                  // 提供坐标方向值的网站  如：https://www.epsg-registry.org/export.htm?wkt=urn:ogc:def:crs:EPSG::4490
                  if (
                    (layerInfo.version === '1.3.0' && layerInfo.projection === 'EPSG:4326') ||
                    (layerInfo.version === '1.3.0' && layerInfo.projection === 'EPSG:4490')
                  ) {
                    layerInfo.extent = [bbox[1], bbox[0], bbox[3], bbox[2]];
                  } else {
                    layerInfo.extent = bbox;
                  }
                  break;
                }
              }
            }
          }
          resolve();
        })
        .catch(function (error) {
          that.errorCallback && that.errorCallback(error, 'getWMSFaild', that.map);
          resolve();
        });
    });
    return promise;
  }
  /**
   * @private
   * @function WebMap.prototype.getTileUrl
   * @description 获取wmts的图层参数。
   * @param {Object} getTileArray - 图层信息。
   * @param {string} layer - 选择的图层
   * @param {string} format - 选择的出图方式
   * @param {boolean} isKvp - 是否是kvp方式
   */
  getTileUrl(getTileArray, layer, format, isKvp) {
    let url;
    if (isKvp) {
      getTileArray.forEach((data) => {
        if (data.Constraint[0].AllowedValues.Value[0].toUpperCase() === 'KVP') {
          url = data.href;
        }
      });
    } else {
      const reuslt = layer.ResourceURL.filter((resource) => {
        return resource.format === format;
      });
      url = reuslt[0].template;
    }
    return url;
  }

  /**
   * @private
   * @function WebMap.prototype.createWMTSSource
   * @description 获取WMTS类型图层的source。
   * @param {Object} layerInfo - 图层信息。
   * @returns {ol.source.WMTS} wmts的souce
   */
  createWMTSSource(layerInfo) {
    let extent = layerInfo.extent || olProj.get(layerInfo.projection).getExtent();

    // 单位通过坐标系获取 （PS: 以前代码非4326 都默认是米）
    let unit = olProj.get(this.baseProjection).getUnits();
    const that = this;
    return new WMTS({
      url: layerInfo.tileUrl || layerInfo.url,
      layer: layerInfo.layer,
      format: layerInfo.layerFormat,
      style: layerInfo.style,
      matrixSet: layerInfo.tileMatrixSet,
      requestEncoding: layerInfo.requestEncoding || 'KVP',
      tileGrid: this.getWMTSTileGrid(
        extent,
        layerInfo.scales,
        unit,
        layerInfo.dpi,
        layerInfo.origin,
        layerInfo.matrixIds
      ),
      tileLoadFunction: this.getCustomTileLoadFunction(function (src) {
        if (src.indexOf('tianditu.gov.cn') >= 0) {
          return `${src}&tk=${CommonUtil.getParameters(layerInfo.url)['tk']}`;
        }
        if(that.isAddProxy(src, layerInfo.proxy)) {
          return `${that.getProxy('png')}${encodeURIComponent(src)}`;
        }
        return src;
      })
    });
  }

  /**
   * @private
   * @function WebMap.prototype.getWMTSTileGrid
   * @description 获取wmts的瓦片。
   * @param {Object} extent - 图层范围。
   * @param {number} scales - 图层比例尺
   * @param {string} unit - 单位
   * @param {number} dpi - dpi
   * @param {Array} origin 瓦片的原点
   * @returns {ol.tilegrid.WMTS} wmts的瓦片
   */
  getWMTSTileGrid(extent, scales, unit, dpi, origin, matrixIds) {
    let resolutionsInfo = this.getReslutionsFromScales(scales, dpi || dpiConfig.iServerWMTS, unit);
    return new WMTSTileGrid({
      origin,
      extent: extent,
      resolutions: resolutionsInfo.res,
      matrixIds: matrixIds || resolutionsInfo.matrixIds
    });
  }

  /**
   * @private
   * @function WebMap.prototype.getReslutionsFromScales
   * @description 根据比例尺（比例尺分母）、地图单位、dpi、获取一个分辨率数组
   * @param {Array.<number>} scales - 比例尺（比例尺分母）
   * @param {number} dpi - 地图dpi
   * @param {string} unit - 单位
   * @param {number} datumAxis
   * @returns {{res: Array, matrixIds: Array}}
   */
  getReslutionsFromScales(scales, dpi, unit, datumAxis) {
    unit = (unit && unit.toLowerCase()) || 'degrees';
    dpi = dpi || dpiConfig.iServerWMTS;
    datumAxis = datumAxis || 6378137;
    let res = [],
      matrixIds = [];
    //给个默认的
    if (Util.isArray(scales)) {
      scales &&
        scales.forEach(function (scale, idx) {
          if (scale > 1.0) {
            matrixIds.push(idx);
            res.push(this.getResolutionFromScale(scale, dpi, unit, datumAxis));
          }
        }, this);
    } else {
      let tileMatrixSet = scales['TileMatrix'];
      tileMatrixSet &&
        tileMatrixSet.forEach(function (tileMatrix) {
          matrixIds.push(tileMatrix['Identifier']);
          res.push(this.getResolutionFromScale(tileMatrix['ScaleDenominator'], dpi, unit, datumAxis));
        }, this);
    }
    return {
      res: res,
      matrixIds: matrixIds
    };
  }

  /**
   * @private
   * @function WebMap.prototype.getResolutionFromScale
   * @description 获取一个WMTS source需要的tileGrid
   * @param {number} scale - 比例尺（比例尺分母）
   * @param {number} dpi - 地图dpi
   * @param {string} unit - 单位
   * @param {number} datumAxis
   * @returns {{res: Array, matrixIds: Array}}
   */
  getResolutionFromScale(scale, dpi = dpiConfig.default, unit, datumAxis) {
    //radio = 10000;
    let res;
    scale = +scale;
    scale = scale > 1.0 ? 1.0 / scale : scale;
    if (unit === 'degrees' || unit === 'dd' || unit === 'degree') {
      res = (0.0254 * 10000) / dpi / scale / ((Math.PI * 2 * datumAxis) / 360) / 10000;
    } else {
      res = (0.0254 * 10000) / dpi / scale / 10000;
    }
    return res;
  }

  /**
   * @private
   * @function WebMap.prototype.isValidResponse
   * @description 返回信息是否符合对应类型的标准
   * @param {Object} response - 返回的信息
   * @returns {boolean}
   */
  isValidResponse(response) {
    let responseEnum = ['Contents', 'OperationsMetadata'],
      valid = true;
    for (let i = 0; i < responseEnum.length; i++) {
      if (!response[responseEnum[i]] || response.error) {
        valid = false;
        break;
      }
    }
    return valid;
  }

  /**
   * @private
   * @function WebMap.prototype.addLayers
   * @description 添加叠加图层
   * @param {Object} mapInfo - 地图信息
   */
  async addLayers(mapInfo) {
    let layers = mapInfo.layers,
      that = this;
    let features = [],
      len = layers.length;
    if (len > 0) {
      //存储地图上所有的图层对象
      this.layers = layers;
      for (let index = 0; index < layers.length; index++) {
        const layer = layers[index];
        //加上底图的index
        let layerIndex = index + 1,
          dataSource = layer.dataSource,
          isSampleData = dataSource && dataSource.type === 'SAMPLE_DATA' && !!dataSource.name; //SAMPLE_DATA是本地示例数据
        if (layer.layerType === 'MAPBOXSTYLE') {
          that
            .addMVTMapLayer(mapInfo, layer, layerIndex)
            .then(() => {
              that.layerAdded++;
              that.sendMapToUser(len);
            })
            .catch(function (error) {
              that.layerAdded++;
              that.sendMapToUser(len);
              that.errorCallback && that.errorCallback(error, 'getLayerFaild', that.map);
            });
        } else if (
          (dataSource && dataSource.serverId) ||
          layer.layerType === 'MARKER' ||
          layer.layerType === 'HOSTED_TILE' ||
          isSampleData
        ) {
          //数据存储到iportal上了
          let dataSource = layer.dataSource,
            serverId = dataSource ? dataSource.serverId : layer.serverId;
          if (!serverId && !isSampleData) {
            await that.addLayer(layer, null, layerIndex);
            that.layerAdded++;
            that.sendMapToUser(len);
            continue;
          }
          if (
            layer.layerType === 'MARKER' ||
            (dataSource && (!dataSource.accessType || dataSource.accessType === 'DIRECT')) ||
            isSampleData
          ) {
            //原来二进制文件
            let url = isSampleData
              ? `${that.server}apps/dataviz/libs/sample-datas/${dataSource.name}.json`
              : `${that.server}web/datas/${serverId}/content.json?pageSize=9999999&currentPage=1`;
            url = that.getRequestUrl(url, layer.proxy);
            FetchRequest.get(url, null, {
              withCredentials: that.isCredentail(url, layer.proxy)
            })
              .then(function (response) {
                return response.json();
              })
              .then(async function (data) {
                if (data.succeed === false) {
                  //请求失败
                  that.layerAdded++;
                  that.sendMapToUser(len);
                  that.errorCallback && that.errorCallback(data.error, 'getLayerFaild', that.map);
                  return;
                }
                if (data && data.type) {
                  if (data.type === 'JSON' || data.type === 'GEOJSON') {
                    data.content = data.content.type ? data.content : JSON.parse(data.content);
                    features = that.geojsonToFeature(data.content, layer);
                  } else if (data.type === 'EXCEL' || data.type === 'CSV') {
                    if (layer.dataSource && layer.dataSource.administrativeInfo) {
                      //行政规划信息
                      data.content.rows.unshift(data.content.colTitles);
                      let { divisionType, divisionField } = layer.dataSource.administrativeInfo;
                      let geojson = await that.excelData2FeatureByDivision(data.content, divisionType, divisionField);
                      features = that._parseGeoJsonData2Feature({
                        allDatas: { features: geojson.features },
                        fileCode: layer.projection
                      });
                    } else {
                      features = await that.excelData2Feature(data.content, layer);
                    }
                  } else if (data.type === 'SHP') {
                    let content = JSON.parse(data.content);
                    data.content = content.layers[0];
                    features = that.geojsonToFeature(data.content, layer);
                  }
                  await that.addLayer(layer, features, layerIndex);
                  that.layerAdded++;
                  that.sendMapToUser(len);
                }
              })
              .catch(function (error) {
                that.layerAdded++;
                that.sendMapToUser(len);
                that.errorCallback && that.errorCallback(error, 'getLayerFaild', that.map);
              });
          } else {
            //关系型文件
            let isMapService = layer.layerType === 'HOSTED_TILE',
              serverId = dataSource ? dataSource.serverId : layer.serverId;
            that
              .checkUploadToRelationship(serverId)
              .then(function (result) {
                if (result && result.length > 0) {
                  let datasetName = result[0].name,
                    featureType = result[0].type.toUpperCase();
                  that.getDataService(serverId, datasetName).then(async function (data) {
                    let dataItemServices = data.dataItemServices;
                    if (dataItemServices.length === 0) {
                      that.layerAdded++;
                      that.sendMapToUser(len);
                      that.errorCallback && that.errorCallback(null, 'getLayerFaild', that.map);
                      return;
                    }
                    if (isMapService) {
                      //需要判断是使用tile还是mvt服务
                      let dataService = that.getService(dataItemServices, 'RESTDATA');
                      that
                        .isMvt(dataService.address, datasetName, layer.proxy)
                        .then(async (info) => {
                          await that.getServiceInfoFromLayer(
                            layerIndex,
                            len,
                            layer,
                            dataItemServices,
                            datasetName,
                            featureType,
                            info
                          );
                        })
                        .catch(async () => {
                          //判断失败就走之前逻辑，>数据量用tile
                          await that.getServiceInfoFromLayer(
                            layerIndex,
                            len,
                            layer,
                            dataItemServices,
                            datasetName,
                            featureType
                          );
                        });
                    } else {
                      await that.getServiceInfoFromLayer(
                        layerIndex,
                        len,
                        layer,
                        dataItemServices,
                        datasetName,
                        featureType
                      );
                    }
                  });
                } else {
                  that.layerAdded++;
                  that.sendMapToUser(len);
                  that.errorCallback && that.errorCallback(null, 'getLayerFaild', that.map);
                }
              })
              .catch(function (error) {
                that.layerAdded++;
                that.sendMapToUser(len);
                that.errorCallback && that.errorCallback(error, 'getLayerFaild', that.map);
              });
          }
        } else if (dataSource && dataSource.type === 'USER_DATA') {
          that.addGeojsonFromUrl(layer, len, layerIndex);
        } else if (layer.layerType === 'TILE') {
          that.getTileLayerExtent(
            layer,
            function (layerInfo) {
              that.map.addLayer(that.createBaseLayer(layerInfo, layerIndex));
              that.layerAdded++;
              that.sendMapToUser(len);
            },
            function (e) {
              that.layerAdded++;
              that.sendMapToUser(len);
              that.errorCallback && that.errorCallback(e, 'getLayerFaild', that.map);
            }
          );
        } else if (layer.layerType === 'SUPERMAP_REST' || layer.layerType === 'WMS' || layer.layerType === 'WMTS') {
          if (layer.layerType === 'WMTS') {
            that.getWmtsInfo(layer, function (layerInfo) {
              that.map.addLayer(that.createBaseLayer(layerInfo, layerIndex));
              that.layerAdded++;
              that.sendMapToUser(len);
            });
          } else if (layer.layerType === 'WMS') {
            that.getWmsInfo(layer).then(() => {
              that.map.addLayer(that.createBaseLayer(layer, layerIndex));
              that.layerAdded++;
              that.sendMapToUser(len);
            });
          } else {
            layer.projection = that.baseProjection;
            that.map.addLayer(that.createBaseLayer(layer, layerIndex));
            that.layerAdded++;
            that.sendMapToUser(len);
          }
        } else if (dataSource && dataSource.type === 'REST_DATA') {
          //从restData获取数据
          that.getFeaturesFromRestData(layer, layerIndex, len);
        } else if (dataSource && dataSource.type === 'REST_MAP' && dataSource.url) {
          //示例数据
          queryFeatureBySQL(
            dataSource.url,
            dataSource.layerName,
            'smid=1',
            null,
            null,
            function (result) {
              var recordsets = result && result.result.recordsets;
              var recordset = recordsets && recordsets[0];
              var attributes = recordset.fields;
              if (recordset && attributes) {
                let fileterAttrs = [];
                for (var i in attributes) {
                  var value = attributes[i];
                  if (value.indexOf('Sm') !== 0 || value === 'SmID') {
                    fileterAttrs.push(value);
                  }
                }
                that.getFeatures(
                  fileterAttrs,
                  layer,
                  async function (features) {
                    await that.addLayer(layer, features, layerIndex);
                    that.layerAdded++;
                    that.sendMapToUser(len);
                  },
                  function (e) {
                    that.layerAdded++;
                    that.errorCallback && that.errorCallback(e, 'getFeatureFaild', that.map);
                  }
                );
              }
            },
            function (e) {
              that.errorCallback && that.errorCallback(e, 'getFeatureFaild', that.map);
            }
          );
        } else if (layer.layerType === 'DATAFLOW_POINT_TRACK' || layer.layerType === 'DATAFLOW_HEAT') {
          that.getDataflowInfo(
            layer,
            async function () {
              await that.addLayer(layer, features, layerIndex);
              that.layerAdded++;
              that.sendMapToUser(len);
            },
            function (e) {
              that.layerAdded++;
              that.errorCallback && that.errorCallback(e, 'getFeatureFaild', that.map);
            }
          );
        } else if (layer.layerType === 'ZXY_TILE') {
          that.map.addLayer(that.createBaseLayer(layer, layerIndex));
          that.layerAdded++;
          that.sendMapToUser(len);
        }
      }
    }
  }
  /**
   * @private
   * @function WebMap.prototype.addGeojsonFromUrl
   * @description 从web服务输入geojson地址的图层
   * @param {Object} layerInfo - 图层信息
   * @param {number} len - 总的图层数量
   * @param {number} layerIndex - 当前图层index
   */
  addGeojsonFromUrl(layerInfo, len, layerIndex) {
    // 通过web添加geojson不需要携带cookie
    let { dataSource } = layerInfo,
      { url } = dataSource,
      that = this;
    FetchRequest.get(url, null, {
      withCredentials: that.isCredentail(url),
      withoutFormatSuffix: true
    })
      .then(function (response) {
        return response.json();
      })
      .then(async function (data) {
        if (!data || data.succeed === false) {
          //请求失败
          if (len) {
            that.errorCallback && that.errorCallback(data.error, 'autoUpdateFaild', that.map);
          } else {
            that.layerAdded++;
            that.sendMapToUser(len);
            that.errorCallback && that.errorCallback(data.error, 'getLayerFaild', that.map);
          }
          return;
        }
        var features;
        if (data.type === 'CSV' || data.type === 'EXCEL') {
          if (layerInfo.dataSource && layerInfo.dataSource.administrativeInfo) {
            //行政规划信息
            data.content.rows.unshift(data.content.colTitles);
            let { divisionType, divisionField } = layerInfo.dataSource.administrativeInfo;
            let geojson = that.excelData2FeatureByDivision(data.content, divisionType, divisionField);
            features = that._parseGeoJsonData2Feature({
              allDatas: { features: geojson.features },
              fileCode: layerInfo.projection
            });
          } else {
            features = await that.excelData2Feature(data.content, layerInfo);
          }
        } else {
          var geoJson = data.content ? JSON.parse(data.content) : data;
          features = that.geojsonToFeature(geoJson, layerInfo);
        }
        if (len) {
          //上图
          await that.addLayer(layerInfo, features, layerIndex);
          that.layerAdded++;
          that.sendMapToUser(len);
        } else {
          //自动更新
          that.map.removeLayer(layerInfo.layer);
          layerInfo.labelLayer && that.map.removeLayer(layerInfo.labelLayer);
          await that.addLayer(layerInfo, features, layerIndex);
        }
      })
      .catch(function (error) {
        that.layerAdded++;
        that.sendMapToUser(len);
        that.errorCallback && that.errorCallback(error, 'getLayerFaild', that.map);
      });
  }
  /**
   * @private
   * @function WebMap.prototype.getServiceInfoFromLayer
   * @description 判断使用哪种服务上图
   * @param {number} layerIndex - 图层对应的index
   * @param {number} len - 成功添加的图层个数
   * @param {Object} layer - 图层信息
   * @param {Array.<Object>} dataItemServices - 数据发布的服务
   * @param {string} datasetName - 数据服务的数据集名称
   * @param {string} featureType - feature类型
   * @param {Object} info - 数据服务的信息
   */
  async getServiceInfoFromLayer(layerIndex, len, layer, dataItemServices, datasetName, featureType, info) {
    let that = this;
    let isMapService = info ? !info.isMvt : layer.layerType === 'HOSTED_TILE',
      isAdded = false;
    for (let i = 0; i < dataItemServices.length; i++) {
      const service = dataItemServices[i];
      if (isAdded) {
        return;
      }
      //有服务了，就不需要循环
      if (service && isMapService && service.serviceType === 'RESTMAP') {
        isAdded = true;
        //地图服务,判断使用mvt还是tile
        that.getTileLayerInfo(service.address, layer.proxy).then(function (restMaps) {
          restMaps.forEach(function (restMapInfo) {
            let bounds = restMapInfo.bounds;
            layer.layerType = 'TILE';
            layer.orginEpsgCode = that.baseProjection;
            layer.units = restMapInfo.coordUnit && restMapInfo.coordUnit.toLowerCase();
            layer.extent = [bounds.left, bounds.bottom, bounds.right, bounds.top];
            layer.visibleScales = restMapInfo.visibleScales;
            layer.url = restMapInfo.url;
            layer.sourceType = 'TILE';
            that.map.addLayer(that.createBaseLayer(layer, layerIndex));
            that.layerAdded++;
            that.sendMapToUser(len);
          });
        });
      } else if (service && !isMapService && service.serviceType === 'RESTDATA') {
        isAdded = true;
        if (info && info.isMvt) {
          let bounds = info.bounds;
          layer = Object.assign(layer, {
            layerType: 'VECTOR_TILE',
            epsgCode: info.epsgCode,
            projection: `EPSG:${info.epsgCode}`,
            bounds: bounds,
            extent: [bounds.left, bounds.bottom, bounds.right, bounds.top],
            name: layer.name,
            url: info.url,
            visible: layer.visible,
            featureType: featureType,
            serverId: layer.serverId.toString()
          });
          that.map.addLayer(await that.addVectorTileLayer(layer, layerIndex, 'RESTDATA'));
          that.layerAdded++;
          that.sendMapToUser(len);
        } else {
          //数据服务
          isAdded = true;
          //关系型文件发布的数据服务
          that.getDatasources(service.address).then(function (datasourceName) {
            layer.dataSource.dataSourceName = datasourceName + ':' + datasetName;
            layer.dataSource.url = `${service.address}/data`;
            that.getFeaturesFromRestData(layer, layerIndex, len);
          });
        }
      }
    }
    if (!isAdded) {
      //循环完成了，也没有找到合适的服务。有可能服务被删除
      that.layerAdded++;
      that.sendMapToUser(len);
      that.errorCallback && that.errorCallback(null, 'getLayerFaild', that.map);
    }
  }

  /**
   * @private
   * @function WebMap.prototype.getDataflowInfo
   * @description 获取数据流服务的参数
   * @param {Object} layerInfo - 图层信息
   * @param {function} success - 成功回调函数
   * @param {function} faild - 失败回调函数
   */
  getDataflowInfo(layerInfo, success, faild) {
    let that = this;
    let url = layerInfo.url,
      token;
    url = this.handleJSONSuffix(url);
    let requestUrl = that.getRequestUrl(url, layerInfo.proxy);
    if (layerInfo.credential && layerInfo.credential.token) {
      token = layerInfo.credential.token;
      requestUrl += `?token=${token}`;
    }
    FetchRequest.get(requestUrl, null, {
      withCredentials: that.isCredentail(url, layerInfo.proxy)
    })
      .then(function (response) {
        return response.json();
      })
      .then(function (result) {
        layerInfo.featureType = 'POINT';
        if (result && result.featureMetaData) {
          layerInfo.featureType = result.featureMetaData.featureType.toUpperCase();
        }
        layerInfo.wsUrl = result.urls[0].url;
        success();
      })
      .catch(function () {
        faild();
      });
  }

  /**
   * @private
   * @function WebMap.prototype.getFeaturesFromRestData
   * @description 从数据服务中获取feature
   * @param {Object} layer - 图层信息
   * @param {number} layerIndex - 图层index
   * @param {number} layerLength - 图层数量
   */
  getFeaturesFromRestData(layer, layerIndex, layerLength) {
    let that = this,
      dataSource = layer.dataSource,
      url = layer.dataSource.url,
      dataSourceName = dataSource.dataSourceName || layer.name;
    let requestUrl = that.formatUrlWithCredential(url),
      serviceOptions = {};
    serviceOptions.withCredentials = this.isCredentail(url, layer.proxy);
    if (
      that.isAddProxy(requestUrl, layer.proxy)
    ) {
      serviceOptions.proxy = this.getProxy();
    }
    if (['EPSG:0'].includes(layer.projection)) {
      // 不支持动态投影restData服务
      that.layerAdded++;
      that.sendMapToUser(layerLength);
      that.errorCallback && that.errorCallback({}, 'getFeatureFaild', that.map);
      return;
    }
    //因为itest上使用的https，iserver是http，所以要加上代理
    getFeatureBySQL(
      requestUrl,
      [decodeURIComponent(dataSourceName)],
      serviceOptions,
      async function (result) {
        let features = that.parseGeoJsonData2Feature({
          allDatas: {
            features: result.result.features.features
          },
          fileCode: that.baseProjection, //因为获取restData用了动态投影，不需要再进行坐标转换。所以此处filecode和底图坐标系一致
          featureProjection: that.baseProjection
        });
        await that.addLayer(layer, features, layerIndex);
        that.layerAdded++;
        that.sendMapToUser(layerLength);
      },
      function (err) {
        that.layerAdded++;
        that.sendMapToUser(layerLength);
        that.errorCallback && that.errorCallback(err, 'getFeatureFaild', that.map);
      },
      that.baseProjection.split('EPSG:')[1],
      this.restDataSingleRequestCount
    );
  }

  /**
   * @private
   * @function WebMap.prototype.getFeatures
   * @description 从地图中获取feature
   * @param {Object} fields - 图层信息
   * @param {number} layerInfo - 图层index
   * @param {number} success - 成功回调
   * @param {number} faild - 失败回调
   */
  getFeatures(fields, layerInfo, success, faild) {
    var that = this;
    var source = layerInfo.dataSource;
    var fileCode = layerInfo.projection;
    queryFeatureBySQL(
      source.url,
      source.layerName,
      null,
      fields,
      null,
      function (result) {
        var recordsets = result.result.recordsets[0];
        var features = recordsets.features.features;

        var featuresObj = that.parseGeoJsonData2Feature(
          {
            allDatas: {
              features
            },
            fileCode: fileCode,
            featureProjection: that.baseProjection
          },
          'JSON'
        );
        success(featuresObj);
      },
      function (err) {
        faild(err);
      }
    );
  }

  /**
   * @private
   * @function WebMap.prototype.sendMapToUser
   * @description 将所有叠加图层叠加后，返回最终的map对象给用户，供他们操作使用
   * @param {number} layersLen - 叠加图层总数
   */
  sendMapToUser(layersLen) {
    const lens = this.isHaveGraticule ? layersLen + 1 : layersLen;
    if (this.layerAdded === lens && this.successCallback) {
      this.successCallback(this.map, this.mapParams, this.layers, this.baseLayer);
    }
  }

  /**
   * @private
   * @function WebMap.prototype.excelData2Feature
   * @description 将csv和xls文件内容转换成ol.feature
   * @param {Object} content - 文件内容
   * @param {Object} layerInfo - 图层信息
   * @returns {Array}  ol.feature的数组集合
   */
  async excelData2Feature(content, layerInfo) {
    let rows = content.rows,
      colTitles = content.colTitles;
    // 解决V2恢复的数据中含有空格
    for (let i in colTitles) {
      if (Util.isString(colTitles[i])) {
        colTitles[i] = Util.trim(colTitles[i]);
      }
    }
    let fileCode = layerInfo.projection,
      dataSource = layerInfo.dataSource,
      baseLayerEpsgCode = this.baseProjection,
      features = [],
      xField = Util.trim((layerInfo.xyField && layerInfo.xyField.xField) || (layerInfo.from && layerInfo.from.xField)),
      yField = Util.trim((layerInfo.xyField && layerInfo.xyField.yField) || (layerInfo.from && layerInfo.from.yField)),
      xIdx = colTitles.indexOf(xField),
      yIdx = colTitles.indexOf(yField);

    // todo 优化 暂时这样处理
    if (layerInfo.layerType === 'MIGRATION') {
      try {
        if (dataSource.type === 'PORTAL_DATA') {
          const requestUrl = `${this.server}web/datas/${dataSource.serverId}.json`;
          const { dataMetaInfo } = await FetchRequest.get(requestUrl, null, {
            withCredentials: this.isCredentail(requestUrl)
          }).then((res) => res.json());
          // eslint-disable-next-line require-atomic-updates
          layerInfo.xyField = {
            xField: dataMetaInfo.xField,
            yField: dataMetaInfo.yField
          };
          if (!dataMetaInfo.xIndex) {
            xIdx = colTitles.indexOf(dataMetaInfo.xField);
            yIdx = colTitles.indexOf(dataMetaInfo.yField);
          } else {
            xIdx = dataMetaInfo.xIndex;
            yIdx = dataMetaInfo.yIndex;
          }
        } else if (dataSource.type === 'SAMPLE_DATA') {
          // 示例数据从本地拿xyField
          const sampleData = SampleDataInfo.find((item) => item.id === dataSource.name) || {};
          xField = sampleData.xField;
          yField = sampleData.yField;
          layerInfo.xyField = {
            xField,
            yField
          };
          xIdx = colTitles.findIndex((item) => item === xField);
          yIdx = colTitles.findIndex((item) => item === yField);
        }
      } catch (error) {
        console.error(error);
      }
    }

    for (let i = 0, len = rows.length; i < len; i++) {
      let rowDatas = rows[i],
        attributes = {},
        geomX = rows[i][xIdx],
        geomY = rows[i][yIdx];
      // 位置字段信息不存在 过滤数据
      if (geomX !== '' && geomY !== '') {
        let olGeom = new olGeometry.Point([+geomX, +geomY]);
        if (fileCode !== baseLayerEpsgCode) {
          olGeom.transform(fileCode, baseLayerEpsgCode);
        }
        for (let j = 0, leng = rowDatas.length; j < leng; j++) {
          let field = colTitles[j];
          if (field === undefined || field === null) {
            continue;
          }
          field = field.trim();
          if (Object.keys(attributes).indexOf(field) > -1) {
            //说明前面有个一模一样的字段
            const newField = field + '_1';
            attributes[newField] = rowDatas[j];
          } else {
            attributes[field] = rowDatas[j];
          }
        }
        let feature = new Feature({
          geometry: olGeom,
          attributes
        });
        features.push(feature);
      }
    }
    return Promise.resolve(features);
  }
  /**
   * @private
   * @function WebMap.prototype.excelData2FeatureByDivision
   * @description 行政区划数据处理
   * @param {Object} content - 文件内容
   * @param {Object} layerInfo - 图层信息
   * @returns {Object}  geojson对象
   */
  excelData2FeatureByDivision(content, divisionType, divisionField) {

    let asyncInport;
    if (divisionType === 'Province') {
      asyncInport = window.ProvinceData;
    } else if (divisionType === 'City') {
      asyncInport = window.MunicipalData;
    } else if (divisionType === 'GB-T_2260') {
      // let geojso;
      asyncInport = window.AdministrativeArea;
    }
    if(asyncInport){
      return new Promise(resolve => {
        resolve(this.changeExcel2Geojson(asyncInport.features, content.rows, divisionType, divisionField));
      });
    }
    if(divisionType === 'GB-T_2260'){
      return new Promise(resolve => {
        resolve({
          type: 'FeatureCollection',
          features: []
        });
      });
    }
    const dataName = divisionType === 'City' ? 'MunicipalData' : 'ProvinceData';
    const dataFileName = divisionType === 'City' ? 'MunicipalData.js' : 'ProvincialData.js';
    const dataUrl = CommonUtil.urlPathAppend(this.server,`apps/dataviz/libs/administrative_data/${dataFileName}`);
    return FetchRequest.get(this.getRequestUrl(dataUrl), null, {
      withCredentials: this.isCredentail(dataUrl),
      withoutFormatSuffix: true
    })
      .then(response => {
        return response.text();
      })
      .then(result => {
        new Function(result)();
        return this.changeExcel2Geojson(window[dataName].features, content.rows, divisionType, divisionField);
      });
  }

  /**
   * @private
   * @function WebMap.prototype._parseGeoJsonData2Feature
   * @description 将geojson的数据转换成ol.Feature
   * @param {Object} metaData - 文件内容
   * @returns {Array.<ol.Feature>} features
   */
  _parseGeoJsonData2Feature(metaData) {
    let allFeatures = metaData.allDatas.features,
      features = [];
    for (let i = 0, len = allFeatures.length; i < len; i++) {
      //不删除properties转换后，属性全都在feature上
      let properties = Object.assign({}, allFeatures[i].properties);
      delete allFeatures[i].properties;
      let feature = transformTools.readFeature(allFeatures[i], {
        dataProjection: metaData.fileCode,
        featureProjection: this.baseProjection || 'ESPG:4326'
      });
      feature.setProperties({ attributes: properties });
      features.push(feature);
    }
    return features;
  }
  /**
   * @private
   * @function WebMap.prototype.changeExcel2Geojson
   * @description 将excel和csv数据转换成标准geojson数据
   * @param {Array} features - feature对象
   * @param {Array} datas - 数据内容
   * @param {string} divisionType - 行政区划类型
   * @param {string} divisionField - 行政区划字段
   * @returns {Object} geojson对象
   */
  changeExcel2Geojson(features, datas, divisionType, divisionField) {
    let geojson = {
      type: 'FeatureCollection',
      features: []
    };
    if (datas.length < 2) {
      return geojson; //只有一行数据时为标题
    }
    let titles = datas[0],
      rows = datas.slice(1),
      fieldIndex = titles.findIndex((title) => title === divisionField);
    rows.forEach((row) => {
      let feature;
      if (divisionType === 'GB-T_2260') {
        feature = features.find((item) => item.properties.GB === row[fieldIndex]);
      } else {
        feature = Util.getHighestMatchAdministration(features, row[fieldIndex]);
      }
      //todo 需提示忽略无效数据
      if (feature) {
        let newFeature = (window.cloneDeep || cloneDeep)(feature);
        newFeature.properties = {};
        const titleLen = titles.length;
        row.forEach((item, idx) => {
          //空格问题，看见DV多处处理空格问题，TODO统一整理
          if (idx < titleLen) {
            let key = titles[idx].trim();
            newFeature.properties[key] = item;
          }
        });
        geojson.features.push(newFeature);
      }
    });
    return geojson;
  }

  /**
   * @private
   * @function WebMap.prototype.geojsonToFeature
   * @description geojson 转换为 feature
   * @param {Object} layerInfo - 图层信息
   * @returns {Array}  ol.feature的数组集合
   */
  geojsonToFeature(geojson, layerInfo) {
    let allFeatures = geojson.features,
      features = [];
    for (let i = 0, len = allFeatures.length; i < len; i++) {
      //转换前删除properties,这样转换后属性不会重复存储
      let featureAttr = allFeatures[i].properties || {};
      delete allFeatures[i].properties;
      let feature = transformTools.readFeature(allFeatures[i], {
        dataProjection: layerInfo.projection || 'EPSG:4326',
        featureProjection: this.baseProjection || 'ESPG:4326'
      });
      //geojson格式的feature属性没有坐标系字段，为了统一，再次加上
      let coordinate = feature.getGeometry().getCoordinates();
      if (allFeatures[i].geometry.type === 'Point') {
        // 标注图层 还没有属性值时候不加
        if (allFeatures[i].properties) {
          
          allFeatures[i].properties.lon = coordinate[0];
          allFeatures[i].properties.lat = coordinate[1];
        }
      }

      // 标注图层特殊处理
      let isMarker = false;
      let attributes;
      let useStyle;
      if (allFeatures[i].dv_v5_markerInfo) {
        //因为优化代码之前，属性字段都存储在propertise上，markerInfo没有
        attributes = Object.assign({}, allFeatures[i].dv_v5_markerInfo, featureAttr);
        if (attributes.lon) {
          //标注图层不需要
          delete attributes.lon;
          delete attributes.lat;
        }
      }
      if (allFeatures[i].dv_v5_markerStyle) {
        useStyle = allFeatures[i].dv_v5_markerStyle;
        isMarker = true;
      }
      let properties;
      if (isMarker) {
        properties = Object.assign(
          {},
          {
            attributes
          },
          {
            useStyle
          }
        );
        //feature上添加图层的id，为了对应图层
        feature.layerId = layerInfo.timeId;
      } else if (layerInfo.featureStyles) {
        //V4 版本标注图层处理
        let style = JSON.parse(layerInfo.featureStyles[i].style);
        let attr = featureAttr;
        let imgUrl;
        if (attr._smiportal_imgLinkUrl.indexOf('http://') > -1 || attr._smiportal_imgLinkUrl.indexOf('https://') > -1) {
          imgUrl = attr._smiportal_imgLinkUrl;
        } else if (
          attr._smiportal_imgLinkUrl !== undefined &&
          attr._smiportal_imgLinkUrl !== null &&
          attr._smiportal_imgLinkUrl !== ''
        ) {
          //上传的图片，加上当前地址
          imgUrl = `${Util.getIPortalUrl()}resources/markerIcon/${attr._smiportal_imgLinkUrl}`;
        }
        attributes = {
          dataViz_description: attr._smiportal_description,
          dataViz_imgUrl: imgUrl,
          dataViz_title: attr._smiportal_title,
          dataViz_url: attr._smiportal_otherLinkUrl
        };
        style.anchor = [0.5, 1];
        style.src = style.externalGraphic;

        useStyle = style;
        properties = Object.assign(
          {},
          {
            attributes
          },
          {
            useStyle
          }
        );
        delete attr._smiportal_description;
        delete attr._smiportal_imgLinkUrl;
        delete attr._smiportal_title;
        delete attr._smiportal_otherLinkUrl;
      } else {
        properties = { attributes: featureAttr };
      }

      feature.setProperties(properties);
      features.push(feature);
    }
    return features;
  }

  /**
   * @private
   * @function WebMap.prototype.parseGeoJsonData2Feature
   * @description 将从restData地址上获取的json转换成feature（从iserver中获取的json转换成feature）
   * @param {Object} metaData - json内容
   * @returns {Array}  ol.feature的数组集合
   */
  parseGeoJsonData2Feature(metaData) {
    let allFeatures = metaData.allDatas.features,
      features = [];
    for (let i = 0, len = allFeatures.length; i < len; i++) {
      let properties = allFeatures[i].properties;
      delete allFeatures[i].properties;
      let feature = transformTools.readFeature(allFeatures[i], {
        dataProjection: metaData.fileCode || 'EPSG:4326',
        featureProjection: metaData.featureProjection || this.baseProjection || 'EPSG:4326'
      });
      //geojson格式的feature属性没有坐标系字段，为了统一，再次加上
      let geometry = feature.getGeometry();
      // 如果不存在geometry，也不需要组装feature
      if (!geometry) {
        continue;
      }
      let coordinate = geometry.getCoordinates();
      if (allFeatures[i].geometry.type === 'Point') {
        properties.lon = coordinate[0];
        properties.lat = coordinate[1];
      }
      feature.setProperties({
        attributes: properties
      });
      features.push(feature);
    }
    return features;
  }

  /**
   * @private
   * @function WebMap.prototype.addLayer
   * @description 将叠加图层添加到地图上
   * @param {Object} layerInfo - 图层信息
   * @param {Array} features - 图层上的feature集合
   * @param {number} index 图层的顺序
   */
  async addLayer(layerInfo, features, index) {
    let layer,
      that = this;
    if (layerInfo.layerType === 'VECTOR') {
      if (layerInfo.featureType === 'POINT') {
        if (layerInfo.style.type === 'SYMBOL_POINT') {
          layer = this.createSymbolLayer(layerInfo, features);
        } else {
          layer = await this.createGraphicLayer(layerInfo, features);
        }
      } else {
        //线和面
        layer = await this.createVectorLayer(layerInfo, features);
      }
    } else if (layerInfo.layerType === 'UNIQUE') {
      layer = await this.createUniqueLayer(layerInfo, features);
    } else if (layerInfo.layerType === 'RANGE') {
      layer = await this.createRangeLayer(layerInfo, features);
    } else if (layerInfo.layerType === 'HEAT') {
      layer = this.createHeatLayer(layerInfo, features);
    } else if (layerInfo.layerType === 'MARKER') {
      layer = await this.createMarkerLayer(features);
    } else if (layerInfo.layerType === 'DATAFLOW_POINT_TRACK') {
      layer = await this.createDataflowLayer(layerInfo, index);
    } else if (layerInfo.layerType === 'DATAFLOW_HEAT') {
      layer = this.createDataflowHeatLayer(layerInfo);
    } else if (layerInfo.layerType === 'RANK_SYMBOL') {
      layer = await this.createRankSymbolLayer(layerInfo, features);
    } else if (layerInfo.layerType === 'MIGRATION') {
      layer = this.createMigrationLayer(layerInfo, features);
    }
    let layerID = Util.newGuid(8);
    if (layer) {
      layerInfo.name &&
        layer.setProperties({
          name: layerInfo.name,
          layerID: layerID,
          layerType: layerInfo.layerType
        });

      //刷新下图层，否则feature样式出不来
      if (layerInfo && layerInfo.style && layerInfo.style.imageInfo) {
        let img = new Image();
        img.src = layerInfo.style.imageInfo.url;
        img.onload = function () {
          layer.getSource().changed();
        };
      }
      if (layerInfo.layerType === 'MIGRATION') {
        layer.appendTo(this.map);
        // 在这里恢复图层可见性状态
        layer.setVisible(layerInfo.visible);
        // 设置鼠标样式为默认
        layer.setCursor();
      } else {
        layerInfo.opacity != undefined && layer.setOpacity(layerInfo.opacity);
        layer.setVisible(layerInfo.visible);
        this.map.addLayer(layer);
      }
      layer.setZIndex(index);
      const { visibleScale, autoUpdateTime } = layerInfo;
      visibleScale && this.setVisibleScales(layer, visibleScale);
      if (autoUpdateTime && !layerInfo.autoUpdateInterval) {
        //自动更新数据
        let dataSource = layerInfo.dataSource;
        if (dataSource.accessType === 'DIRECT' && !dataSource.url) {
          // 二进制数据更新feautre所需的url
          dataSource.url = `${this.server}web/datas/${dataSource.serverId}/content.json?pageSize=9999999&currentPage=1`;
        }
        layerInfo.autoUpdateInterval = setInterval(() => {
          that.updateFeaturesToMap(layerInfo, index, true);
        }, autoUpdateTime);
      }
    }
    layerInfo.layer = layer;
    layerInfo.layerID = layerID;
    if (layerInfo.labelStyle && layerInfo.labelStyle.labelField && layerInfo.layerType !== 'DATAFLOW_POINT_TRACK') {
      //存在标签专题图
      //过滤条件过滤feature
      features = layerInfo.filterCondition ? this.getFiterFeatures(layerInfo.filterCondition, features) : features;
      this.addLabelLayer(layerInfo, features);
    }
  }
  /**
   * @private
   * @function WebMap.prototype.updateFeaturesToMap
   * @description 更新地图上的feature,适用于专题图
   * @param {Object} layerInfo - 图层信息
   * @param {number} index 图层的顺序
   */
  updateFeaturesToMap(layerInfo, layerIndex) {
    let that = this,
      dataSource = layerInfo.dataSource,
      url = layerInfo.dataSource.url,
      dataSourceName = dataSource.dataSourceName || layerInfo.name;

    if (dataSource.type === 'USER_DATA' || dataSource.accessType === 'DIRECT') {
      that.addGeojsonFromUrl(layerInfo, null, layerIndex);
    } else {
      let requestUrl = that.formatUrlWithCredential(url),
        serviceOptions = {};
      serviceOptions.withCredentials = that.isCredentail(requestUrl);
      if (
        that.isAddProxy(requestUrl)
      ) {
        serviceOptions.proxy = this.getProxy();
      }
      //因为itest上使用的https，iserver是http，所以要加上代理
      getFeatureBySQL(
        requestUrl,
        [dataSourceName],
        serviceOptions,
        async function (result) {
          let features = that.parseGeoJsonData2Feature({
            allDatas: {
              features: result.result.features.features
            },
            fileCode: layerInfo.projection,
            featureProjection: that.baseProjection
          });
          //删除之前的图层和标签图层
          that.map.removeLayer(layerInfo.layer);
          layerInfo.labelLayer && that.map.removeLayer(layerInfo.labelLayer);
          await that.addLayer(layerInfo, features, layerIndex);
        },
        function (err) {
          that.errorCallback && that.errorCallback(err, 'autoUpdateFaild', that.map);
        },
        undefined,
        this.restDataSingleRequestCount
      );
    }
  }

  /**
   * @private
   * @function WebMap.prototype.addVectorTileLayer
   * @description 添加vectorTILE图层
   * @param {Object} layerInfo - 图层信息
   * @param {number} index 图层的顺序
   * @param {string} type 创建的图层类型，restData为创建数据服务的mvt, restMap为创建地图服务的mvt
   * @returns {ol.layer.VectorTile}  图层对象
   */
  async addVectorTileLayer(layerInfo, index, type) {
    let layer;
    if (type === 'RESTDATA') {
      //用的是restdata服务的mvt
      layer = await this.createDataVectorTileLayer(layerInfo);
    }
    let layerID = Util.newGuid(8);
    if (layer) {
      layerInfo.name &&
        layer.setProperties({
          name: layerInfo.name,
          layerID: layerID
        });
      layerInfo.opacity != undefined && layer.setOpacity(layerInfo.opacity);
      layer.setVisible(layerInfo.visible);
      layer.setZIndex(index);
    }
    layerInfo.layer = layer;
    layerInfo.layerID = layerID;
    return layer;
  }
  /**
   * @private
   * @function WebMap.prototype.createDataVectorTileLayer
   * @description 创建vectorTILE图层
   * @param {Object} layerInfo - 图层信息
   * @returns {ol.layer.VectorTile} 图层对象
   */
  async createDataVectorTileLayer(layerInfo) {
    //创建图层
    var format = new MVT({
      featureClass: Feature
    });
    //要加上这一句，否则坐标，默认都是3857
    MVT.prototype.readProjection = function () {
      return new olProj.Projection({
        code: '',
        units: 'tile-pixels'
      });
    };
    let featureType = layerInfo.featureType;
    let style = await StyleUtils.toOpenLayersStyle(this.getDataVectorTileStyle(featureType), featureType);
    const requestParameters = this.tileRequestParameters && this.tileRequestParameters(layerInfo.url);
    return new olLayer.VectorTile({
      //设置避让参数
      source: new VectorTileSuperMapRest({
        url: layerInfo.url,
        projection: layerInfo.projection,
        tileType: 'ScaleXY',
        format: format,
        ...requestParameters
      }),
      style: style
    });
  }
  /**
   * @private
   * @function WebMap.prototype.getDataVectorTileStyle
   * @description 获取数据服务的mvt上图的默认样式
   * @param {string} featureType - 要素类型
   * @returns {Object} 样式参数
   */
  getDataVectorTileStyle(featureType) {
    let styleParameters = {
      radius: 8, //圆点半径
      fillColor: '#EE4D5A', //填充色
      fillOpacity: 0.9,
      strokeColor: '#ffffff', //边框颜色
      strokeWidth: 1,
      strokeOpacity: 1,
      lineDash: 'solid',
      type: 'BASIC_POINT'
    };
    if (['LINE', 'LINESTRING', 'MULTILINESTRING'].indexOf(featureType) > -1) {
      styleParameters.strokeColor = '#4CC8A3';
      styleParameters.strokeWidth = 2;
    } else if (['REGION', 'POLYGON', 'MULTIPOLYGON'].indexOf(featureType) > -1) {
      styleParameters.fillColor = '#826DBA';
    }
    return styleParameters;
  }

  /**
   * @private
   * @function WebMap.prototype.getFiterFeatures
   * @description 通过过滤条件查询满足的feature
   * @param {string} filterCondition - 过滤条件
   * @param {Array} allFeatures - 图层上的feature集合
   */
  getFiterFeatures(filterCondition, allFeatures) {
    let condition = this.parseFilterCondition(filterCondition);
    let filterFeatures = [];
    for (let i = 0; i < allFeatures.length; i++) {
      let feature = allFeatures[i];
      let filterResult = false;
      try {
        const properties = feature.get('attributes');
        const conditions = parseCondition(condition, Object.keys(properties));
        const filterFeature = parseConditionFeature(properties);
        const sql = 'select * from json where (' + conditions + ')';
        filterResult = window.jsonsql.query(sql, { attributes: filterFeature });
      } catch (err) {
        //必须把要过滤得内容封装成一个对象,主要是处理jsonsql(line : 62)中由于with语句遍历对象造成的问题
        continue;
      }
      if (filterResult && filterResult.length > 0) {
        //afterFilterFeatureIdx.push(i);
        filterFeatures.push(feature);
      }
    }
    return filterFeatures;
  }

  /**
   * @private
   * @function WebMap.prototype.parseFilterCondition
   * @description 1、替换查询语句 中的 and / AND / or / OR / = / !=
   *              2、匹配 Name in ('', '')，多条件需用()包裹
   * @param {string} filterCondition - 过滤条件
   * @return {string} 换成组件能识别的字符串
   */
  parseFilterCondition(filterCondition) {
    return filterCondition
      .replace(/=/g, '==')
      .replace(/AND|and/g, '&&')
      .replace(/or|OR/g, '||')
      .replace(/<==/g, '<=')
      .replace(/>==/g, '>=')
      .replace(/\(?[^\(]+?\s*in\s*\([^\)]+?\)\)?/gi, (res) => {
        // res格式：(省份 in ('四川', '河南'))
        const data = res.match(/([^(]+?)\s*in\s*\(([^)]+?)\)/i);
        return data.length === 3
          ? `(${data[2]
              .split(',')
              .map((c) => `${data[1]} == ${c.trim()}`)
              .join(' || ')})`
          : res;
      });
  }

  /**
   * @private
   * @function WebMap.prototype.createGraphicLayer
   * @description 添加大数据图层到地图上
   * @param {Object} layerInfo - 图层信息
   * @param {Array} features - feature的集合
   * @return {ol.layer.image} 大数据图层
   */
  async createGraphicLayer(layerInfo, features) {
    features = layerInfo.filterCondition ? this.getFiterFeatures(layerInfo.filterCondition, features) : features;
    let graphics = await this.getGraphicsFromFeatures(features, layerInfo.style, layerInfo.featureType);
    let source = new GraphicSource({
      graphics: graphics,
      render: 'canvas',
      map: this.map,
      isHighLight: false
    });
    return new olLayer.Image({
      source: source
    });
  }

  /**
   * @private
   * @function WebMap.prototype.getGraphicsFromFeatures
   * @description 将feature转换成大数据图层对应的Graphics要素
   * @param {Array} features - feature的集合
   * @param {Object} style - 图层样式
   * @param {string} featureType - feature的类型
   * @return {Array} 大数据图层要素数组
   */
  async getGraphicsFromFeatures(features, style, featureType) {
    let olStyle = await StyleUtils.getOpenlayersStyle(style, featureType),
      shape = olStyle.getImage();
    let graphics = [];
    //构建graphic
    for (let i in features) {
      let graphic = new OverlayGraphic(features[i].getGeometry());
      graphic.setStyle(shape);
      graphic.setProperties({ attributes: features[i].get('attributes') });
      graphics.push(graphic);
    }
    return graphics;
  }

  /**
   * @private
   * @function WebMap.prototype.createSymbolLayer
   * @description 添加符号图层
   * @param {Object} layerInfo - 图层信息
   * @param {Array} features - feature的集合
   * @return {ol.layer.Vector} 符号图层
   */
  createSymbolLayer(layerInfo, features) {
    let style = StyleUtils.getSymbolStyle(layerInfo.style);
    return new olLayer.Vector({
      style: style,
      source: new Vector({
        features: layerInfo.filterCondition ? this.getFiterFeatures(layerInfo.filterCondition, features) : features,
        wrapX: false
      }),
      renderMode: 'image'
    });
  }

  /**
   * @private
   * @function WebMap.prototype.addLabelLayer
   * @description 添加标签图层
   * @param {Object} layerInfo - 图层信息
   * @param {Array} features -feature的集合
   * @returns {ol.layer.Vector} 图层对象
   */
  addLabelLayer(layerInfo, features) {
    let labelStyle = layerInfo.labelStyle;
    let style = this.getLabelStyle(labelStyle, layerInfo);
    let layer = (layerInfo.labelLayer = new olLayer.Vector({
      declutter: true,
      styleOL: style,
      labelField: labelStyle.labelField,
      source: new Vector({
        features: features,
        wrapX: false
      })
    }));
    layer.setStyle((features) => {
      let labelField = labelStyle.labelField;
      let label = features.get('attributes')[labelField.trim()] + '';
      if (label === 'undefined') {
        return null;
      }
      let styleOL = layer.get('styleOL');
      let text = styleOL.getText();
      if (text && text.setText) {
        text.setText(label);
      }
      return styleOL;
    });
    this.map.addLayer(layer);
    layer.setVisible(layerInfo.visible);
    layer.setZIndex(1000);
    const { visibleScale } = layerInfo;
    visibleScale && this.setVisibleScales(layer, visibleScale);
    return layer;
  }

  /**
   * @private
   * @function WebMap.prototype.setVisibleScales
   * @description 改变图层可视范围
   * @param {Object} layer - 图层对象。ol.Layer
   * @param {Object} visibleScale - 图层样式参数
   */
  setVisibleScales(layer, visibleScale) {
    let maxResolution = this.resolutions[visibleScale.minScale],
      minResolution = this.resolutions[visibleScale.maxScale];
    //比例尺和分别率是反比的关系
    maxResolution > 1 ? layer.setMaxResolution(Math.ceil(maxResolution)) : layer.setMaxResolution(maxResolution * 1.1);
    layer.setMinResolution(minResolution);
  }

  /**
   * @private
   * @function WebMap.prototype.getLabelStyle
   * @description 获取标签样式
   * @param {Object} parameters - 标签图层样式参数
   * @param {Object} layerInfo - 图层样式参数
   * @returns {ol.style.Style} 标签样式
   */
  getLabelStyle(parameters, layerInfo) {
    let style = layerInfo.style || layerInfo.pointStyle;
    const { radius = 0, strokeWidth = 0 } = style,
      beforeOffsetY = -(radius + strokeWidth);
    const {
      fontSize = '14px',
      fontFamily,
      fill,
      backgroundFill,
      offsetX = 0,
      offsetY = beforeOffsetY,
      placement = 'point',
      textBaseline = 'bottom',
      textAlign = 'center',
      outlineColor = '#000000',
      outlineWidth = 0
    } = parameters;
    const option = {
      font: `${fontSize} ${fontFamily}`,
      placement,
      textBaseline,
      fill: new FillStyle({ color: fill }),
      backgroundFill: new FillStyle({ color: backgroundFill }),
      padding: [3, 3, 3, 3],
      offsetX: layerInfo.featureType === 'POINT' ? offsetX : 0,
      offsetY: layerInfo.featureType === 'POINT' ? offsetY : 0,
      overflow: true,
      maxAngle: 0
    };
    if (layerInfo.featureType === 'POINT') {
      //线面不需要此参数，否则超出线面overflow:true，也不会显示标签
      option.textAlign = textAlign;
    }
    if (outlineWidth > 0) {
      option.stroke = new StrokeStyle({
        color: outlineColor,
        width: outlineWidth
      });
    }

    return new Style({
      text: new Text(option)
    });
  }

  /**
   * @private
   * @function WebMap.prototype.createVectorLayer
   * @description 创建vector图层
   * @param {Object} layerInfo - 图层信息
   * @param {Array} features -feature的集合
   * @returns {ol.layer.Vector} 矢量图层
   */
  async createVectorLayer(layerInfo, features) {
    const { featureType, style } = layerInfo;
    let newStyle;
    if (featureType === 'LINE' && Util.isArray(style) && style.length === 2) {
      const [outlineStyle, strokeStyle] = style;
      newStyle =
        !strokeStyle.lineDash || strokeStyle.lineDash === 'solid'
          ? StyleUtils.getRoadPath(strokeStyle, outlineStyle)
          : StyleUtils.getPathway(strokeStyle, outlineStyle);
    } else {
      if (Util.isArray(style)) {
        layerInfo.style = style[0];
      }
      newStyle = await StyleUtils.toOpenLayersStyle(layerInfo.style, layerInfo.featureType);
    }
    return new olLayer.Vector({
      style: newStyle,
      source: new Vector({
        features: layerInfo.filterCondition ? this.getFiterFeatures(layerInfo.filterCondition, features) : features,
        wrapX: false
      })
    });
  }

  /**
   * @private
   * @function WebMap.prototype.createHeatLayer
   * @description 创建热力图图层
   * @param {Object} layerInfo - 图层信息
   * @param {Array} features -feature的集合
   * @returns {ol.layer.Heatmap} 热力图图层
   */
  createHeatLayer(layerInfo, features) {
    //因为热力图，随着过滤，需要重新计算权重
    features = layerInfo.filterCondition ? this.getFiterFeatures(layerInfo.filterCondition, features) : features;
    let source = new Vector({
      features: features,
      wrapX: false
    });
    let layerOptions = {
      source: source
    };
    let themeSetting = layerInfo.themeSetting;
    layerOptions.gradient = themeSetting.colors.slice();
    layerOptions.radius = parseInt(themeSetting.radius);
    //自定义颜色
    let customSettings = themeSetting.customSettings;
    for (let i in customSettings) {
      layerOptions.gradient[i] = customSettings[i];
    }
    // 权重字段恢复
    if (themeSetting.weight) {
      this.changeWeight(features, themeSetting.weight);
    }
    return new olLayer.Heatmap(layerOptions);
  }

  /**
   * @private
   * @function WebMap.prototype.changeWeight
   * @description 改变当前权重字段
   * @param {Array} features - feature的集合
   * @param {string} weightFeild - 权重字段
   */
  changeWeight(features, weightFeild) {
    let that = this;
    this.fieldMaxValue = {};
    this.getMaxValue(features, weightFeild);
    let maxValue = this.fieldMaxValue[weightFeild];
    features.forEach(function (feature) {
      let attributes = feature.get('attributes');
      try {
        let value = attributes[weightFeild];
        feature.set('weight', value / maxValue);
      } catch (e) {
        that.errorCallback && that.errorCallback(e);
      }
    });
  }

  /**
   * @private
   * @function WebMap.prototype.getMaxValue
   * @description 获取当前字段对应的最大值，用于计算权重
   * @param {Array} features - feature 数组
   * @param {string} weightField - 权重字段
   */
  getMaxValue(features, weightField) {
    let values = [],
      that = this,
      attributes;
    let field = weightField;
    if (this.fieldMaxValue[field]) {
      return;
    }
    features.forEach(function (feature) {
      //收集当前权重字段对应的所有值
      attributes = feature.get('attributes');
      try {
        values.push(parseFloat(attributes[field]));
      } catch (e) {
        that.errorCallback && that.errorCallback(e);
      }
    });
    this.fieldMaxValue[field] = ArrayStatistic.getArrayStatistic(values, 'Maximum');
  }

  /**
   * @private
   * @function WebMap.prototype.createUniqueLayer
   * @description 获取当前字段对应的最大值，用于计算权重
   * @param {Object} layerInfo - 图层信息
   * @param {Array} features - 所有feature结合
   */
  async createUniqueLayer(layerInfo, features) {
    let styleSource = await this.createUniqueSource(layerInfo, features);
    let layer = new olLayer.Vector({
      styleSource: styleSource,
      source: new Vector({
        features: layerInfo.filterCondition ? this.getFiterFeatures(layerInfo.filterCondition, features) : features,
        wrapX: false
      })
    });
    layer.setStyle((feature) => {
      let styleSource = layer.get('styleSource');
      let labelField = styleSource.themeField;
      let label = feature.get('attributes')[labelField];
      let styleGroup = styleSource.styleGroups.find((item) => {
        return item.value === label;
      });
      return styleGroup.olStyle;
    });

    return layer;
  }

  /**
   * @private
   * @function WebMap.prototype.createUniqueSource
   * @description 创建单值图层的source
   * @param {Object} parameters- 图层信息
   * @param {Array} features - feature 数组
   * @returns {{map: *, style: *, isHoverAble: *, highlightStyle: *, themeField: *, styleGroups: Array}}
   */
  async createUniqueSource(parameters, features) {
    //找到合适的专题字段
    let styleGroup = await this.getUniqueStyleGroup(parameters, features);
    return {
      map: this.map, //必传参数 API居然不提示
      style: parameters.style,
      isHoverAble: parameters.isHoverAble,
      highlightStyle: parameters.highlightStyle,
      themeField: parameters.themeSetting.themeField,
      styleGroups: styleGroup
    };
  }

  /**
   * @private
   * @function WebMap.prototype.getUniqueStyleGroup
   * @description 获取单值专题图的styleGroup
   * @param {Object} parameters- 图层信息
   * @param {Array} features - feature 数组
   * @returns {Array} 单值样式
   */
  async getUniqueStyleGroup(parameters, features) {
    // 找出所有的单值
    let featureType = parameters.featureType,
      style = parameters.style,
      themeSetting = parameters.themeSetting;
    let fieldName = themeSetting.themeField;

    let names = [],
      customSettings = themeSetting.customSettings;
    for (let i in features) {
      let attributes = features[i].get('attributes');
      let name = attributes[fieldName];
      let isSaved = false;
      for (let j in names) {
        if (names[j] === name) {
          isSaved = true;
          break;
        }
      }
      if (!isSaved) {
        names.push(name);
      }
    }

    //生成styleGroup
    let styleGroup = [];
    const usedColors = this.getCustomSettingColors(customSettings, featureType).map((item) => item.toLowerCase());
    const curentColors = this.getUniqueColors(
      themeSetting.colors || this.defaultParameters.themeSetting.colors,
      names.length + Object.keys(customSettings).length
    ).map((item) => item.toLowerCase());
    const newColors = difference(curentColors, usedColors);
    for (let index = 0; index < names.length; index++) {
      const name = names[index];
      //兼容之前自定义是用key，现在因为数据支持编辑，需要用属性值。
      let key = this.webMapVersion === '1.0' ? index : name;
      let custom = customSettings[key];
      if (Util.isString(custom)) {
        //兼容之前自定义只存储一个color
        custom = this.getCustomSetting(style, custom, featureType);
        customSettings[key] = custom;
      }
      if (!custom) {
        custom = this.getCustomSetting(style, newColors.shift(), featureType);
      }

      // 转化成 ol 样式
      let olStyle,
        type = custom.type;
      if (type === 'SYMBOL_POINT') {
        olStyle = StyleUtils.getSymbolStyle(custom);
      } else if (type === 'SVG_POINT') {
        olStyle = await StyleUtils.getSVGStyle(custom);
      } else if (type === 'IMAGE_POINT') {
        olStyle = StyleUtils.getImageStyle(custom);
      } else {
        olStyle = await StyleUtils.toOpenLayersStyle(custom, featureType);
      }
      styleGroup.push({
        olStyle: olStyle,
        style: customSettings[key],
        value: name
      });
    }
    return styleGroup;
  }

  /**
   * @description 获取单值专题图自定义样式对象。
   * @param {Object} style - 图层上的样式。
   * @param {string} color - 单值对应的颜色。
   * @param {string} featureType - 要素类型。
   */
  getCustomSetting(style, color, featureType) {
    let newProps = {};
    if (featureType === 'LINE') {
      newProps.strokeColor = color;
    } else {
      newProps.fillColor = color;
    }
    let customSetting = Object.assign(style, newProps);
    return customSetting;
  }

  getCustomSettingColors(customSettings, featureType) {
    const keys = Object.keys(customSettings);
    const colors = [];
    keys.forEach((key) => {
      //兼容之前自定义只存储一个color
      if (Util.isString(customSettings[key])) {
        colors.push(customSettings[key]);
        return;
      }
      if (featureType === 'LINE') {
        colors.push(customSettings[key].strokeColor);
      } else if (customSettings[key].fillColor) {
        colors.push(customSettings[key].fillColor);
      }
    });
    return colors;
  }

  getUniqueColors(colors, valuesLen) {
    return ColorsPickerUtil.getGradientColors(colors, valuesLen);
  }

  /**
   * @private
   * @function WebMap.prototype.createRangeLayer
   * @description 创建分段图层
   * @param {Object} layerInfo- 图层信息
   * @param {Array} features - 所有feature结合
   * @returns {ol.layer.Vector} 单值图层
   */
  async createRangeLayer(layerInfo, features) {
    //这里获取styleGroup要用所以的feature
    let styleSource = await this.createRangeSource(layerInfo, features);
    let layer = new olLayer.Vector({
      styleSource: styleSource,
      source: new Vector({
        features: layerInfo.filterCondition ? this.getFiterFeatures(layerInfo.filterCondition, features) : features,
        wrapX: false
      })
    });

    layer.setStyle((feature) => {
      let styleSource = layer.get('styleSource');
      if (styleSource) {
        let labelField = styleSource.themeField;
        let value = Number(feature.get('attributes')[labelField.trim()]);
        let styleGroups = styleSource.styleGroups;
        for (let i = 0; i < styleGroups.length; i++) {
          if (i === 0) {
            if (value >= styleGroups[i].start && value <= styleGroups[i].end) {
              return styleGroups[i].olStyle;
            }
          } else {
            if (value > styleGroups[i].start && value <= styleGroups[i].end) {
              return styleGroups[i].olStyle;
            }
          }
        }
      }
    });

    return layer;
  }

  /**
   * @private
   * @function WebMap.prototype.createRangeSource
   * @description 创建分段专题图的图层source
   * @param {Object} parameters- 图层信息
   * @param {Array} features - 所以的feature集合
   * @returns {Object} 图层source
   */
  async createRangeSource(parameters, features) {
    //找到合适的专题字段
    let styleGroup = await this.getRangeStyleGroup(parameters, features);
    if (styleGroup) {
      return {
        style: parameters.style,
        themeField: parameters.themeSetting.themeField,
        styleGroups: styleGroup
      };
    } else {
      return false;
    }
  }

  /**
   * @private
   * @function WebMap.prototype.getRangeStyleGroup
   * @description 获取分段专题图的styleGroup样式
   * @param {Object} parameters- 图层信息
   * @param {Array} features - 所以的feature集合
   * @returns {Array} styleGroups
   */
  async getRangeStyleGroup(parameters, features) {
    // 找出分段值
    let featureType = parameters.featureType,
      themeSetting = parameters.themeSetting,
      style = parameters.style;
    let count = themeSetting.segmentCount,
      method = themeSetting.segmentMethod,
      colors = themeSetting.colors,
      customSettings = themeSetting.customSettings,
      fieldName = themeSetting.themeField;
    let values = [],
      attributes;
    let segmentCount = count;
    let segmentMethod = method;
    let that = this;
    features.forEach(function (feature) {
      attributes = feature.get('attributes');
      try {
        if (attributes) {
          //过滤掉非数值的数据
          let value = attributes[fieldName.trim()];
          if (value !== undefined && value !== null && Util.isNumber(value)) {
            values.push(parseFloat(value));
          }
        } else if (feature.get(fieldName) && Util.isNumber(feature.get(fieldName))) {
          if (feature.get(fieldName)) {
            values.push(parseFloat(feature.get(fieldName)));
          }
        }
      } catch (e) {
        that.errorCallback && that.errorCallback(e);
      }
    });

    let segements;
    try {
      segements = ArrayStatistic.getArraySegments(values, segmentMethod, segmentCount);
    } catch (e) {
      that.errorCallback && that.errorCallback(e);
    }
    if (segements) {
      let itemNum = segmentCount;
      if (attributes && segements[0] === segements[attributes.length - 1]) {
        itemNum = 1;
        segements.length = 2;
      }

      //保留两位有效数
      for (let key in segements) {
        let value = segements[key];
        if (Number(key) === 0) {
          // 最小的值下舍入,要用两个等于号。否则有些值判断不对
          value = Math.floor(value * 100) / 100;
        } else {
          // 其余上舍入
          value = Math.ceil(value * 100) / 100 + 0.1; // 加0.1 解决最大值没有样式问题
        }

        segements[key] = Number(value.toFixed(2));
      }

      //获取一定量的颜色
      let curentColors = colors;
      curentColors = ColorsPickerUtil.getGradientColors(curentColors, itemNum, 'RANGE');

      for (let index = 0; index < itemNum; index++) {
        if (index in customSettings) {
          if (customSettings[index]['segment']['start']) {
            segements[index] = customSettings[index]['segment']['start'];
          }
          if (customSettings[index]['segment']['end']) {
            segements[index + 1] = customSettings[index]['segment']['end'];
          }
        }
      }
      //生成styleGroup
      let styleGroups = [];
      for (let i = 0; i < itemNum; i++) {
        let color = curentColors[i];
        if (i in customSettings) {
          if (customSettings[i].color) {
            color = customSettings[i].color;
          }
        }
        if (featureType === 'LINE') {
          style.strokeColor = color;
        } else {
          style.fillColor = color;
        }

        // 转化成 ol 样式
        let olStyle = await StyleUtils.toOpenLayersStyle(style, featureType);

        let start = segements[i];
        let end = segements[i + 1];

        styleGroups.push({
          olStyle: olStyle,
          color: color,
          start: start,
          end: end
        });
      }

      return styleGroups;
    } else {
      return false;
    }
  }

  /**
   * @private
   * @function WebMap.prototype.createMarkerLayer
   * @description 创建标注图层
   * @param {Array} features - 所以的feature集合
   * @returns {ol.layer.Vector} 矢量图层
   */
  async createMarkerLayer(features) {
    features && (await this.setEachFeatureDefaultStyle(features));
    return new olLayer.Vector({
      source: new Vector({
        features: features,
        wrapX: false
      })
    });
  }

  /**
   * @private
   * @function WebMap.prototype.createDataflowLayer
   * @description 创建数据流图层
   * @param {Object} layerInfo- 图层信息
   * @param {number} layerIndex - 图层的zindex
   * @returns {ol.layer.Vector} 数据流图层
   */
  async createDataflowLayer(layerInfo, layerIndex) {
    let layerStyle = layerInfo.pointStyle,
      style;
    //获取样式
    style = await StyleUtils.getOpenlayersStyle(layerStyle, layerInfo.featureType);

    let source = new Vector({
        wrapX: false
      }),
      labelLayer,
      labelSource,
      pathLayer,
      pathSource;
    let layer = new olLayer.Vector({
      styleOL: style,
      source: source
    });
    if (layerInfo.labelStyle && layerInfo.visible) {
      //有标签图层
      labelLayer = this.addLabelLayer(layerInfo);
      //和编辑页面保持一致
      labelLayer.setZIndex(1000);
      labelSource = labelLayer.getSource();
    }
    const { visibleScale } = layerInfo;
    if (layerInfo.lineStyle && layerInfo.visible) {
      pathLayer = await this.createVectorLayer({ style: layerInfo.lineStyle, featureType: 'LINE' });
      pathSource = pathLayer.getSource();
      pathLayer.setZIndex(layerIndex);
      this.map.addLayer(pathLayer);
      visibleScale && this.setVisibleScales(pathLayer, visibleScale);
      // 挂载到layerInfo上，便于删除
      layerInfo.pathLayer = pathLayer;
    }
    let featureCache = {},
      labelFeatureCache = {},
      pathFeatureCache = {},
      that = this;
    this.createDataflowService(
      layerInfo,
      (function (featureCache, labelFeatureCache, pathFeatureCache) {
        return function (feature) {
          that.events.triggerEvent('updateDataflowFeature', {
            feature: feature,
            identifyField: layerInfo.identifyField,
            layerID: layerInfo.layerID
          });
          if (layerInfo.filterCondition) {
            //过滤条件
            const condition = that.parseFilterCondition(layerInfo.filterCondition);
            const properties = feature.get('attributes');
            const conditions = parseCondition(condition, Object.keys(properties));
            const filterFeature = parseConditionFeature(properties);
            const sql = 'select * from json where (' + conditions + ')';
            let filterResult = window.jsonsql.query(sql, { attributes: filterFeature });
            if (filterResult && filterResult.length > 0) {
              that.addDataflowFeature(feature, layerInfo.identifyField, {
                dataflowSource: source,
                featureCache: featureCache,
                labelSource: labelSource,
                labelFeatureCache: labelFeatureCache,
                pathSource: pathSource,
                pathFeatureCache: pathFeatureCache,
                maxPointCount: layerInfo.maxPointCount
              });
            }
          } else {
            that.addDataflowFeature(feature, layerInfo.identifyField, {
              dataflowSource: source,
              featureCache: featureCache,
              labelSource: labelSource,
              labelFeatureCache: labelFeatureCache,
              pathSource: pathSource,
              pathFeatureCache: pathFeatureCache,
              maxPointCount: layerInfo.maxPointCount
            });
          }
        };
      })(featureCache, labelFeatureCache, pathFeatureCache)
    );
    this.setFeatureStyle(layer, layerInfo.directionField, layerStyle.type);
    return layer;
  }

  /**
   * @private
   * @function WebMap.prototype.addDataflowFeature
   * @description 添加数据流的feature
   * @param {Object} feature - 服务器更新的feature
   * @param {string} identifyField - 标识feature的字段
   * @param {Object} options - 其他参数
   */
  addDataflowFeature(feature, identifyField, options) {
    options.dataflowSource &&
      this.addFeatureFromDataflowService(options.dataflowSource, feature, identifyField, options.featureCache);
    options.labelSource &&
      this.addFeatureFromDataflowService(options.labelSource, feature, identifyField, options.labelFeatureCache);
    options.pathSource &&
      this.addPathFeature(options.pathSource, feature, identifyField, options.pathFeatureCache, options.maxPointCount);
  }
  /**
   * @private
   * @function WebMap.prototype.addPathFeature
   * @description 添加数据流图层中轨迹线的feature
   * @param {Object} source - 轨迹线图层的source
   * @param {Object} feature - 轨迹线feature
   * @param {string} identifyField - 标识feature的字段
   * @param {Object} featureCache - 存储feature
   * @param {number} maxPointCount - 轨迹线最多点个数数量
   */
  addPathFeature(source, feature, identifyField, featureCache, maxPointCount) {
    let coordinates = [];
    var geoID = feature.get(identifyField);
    if (featureCache[geoID]) {
      //加过feautre
      coordinates = featureCache[geoID].getGeometry().getCoordinates();
      coordinates.push(feature.getGeometry().getCoordinates());
      if (maxPointCount && coordinates.length > maxPointCount) {
        coordinates.splice(0, coordinates.length - maxPointCount);
      }
      featureCache[geoID].getGeometry().setCoordinates(coordinates);
    } else {
      coordinates.push(feature.getGeometry().getCoordinates());
      featureCache[geoID] = new Feature({
        geometry: new olGeometry.LineString(coordinates)
      });
      source.addFeature(featureCache[geoID]);
    }
  }

  /**
   * @private
   * @function WebMap.prototype.setFeatureStyle
   * @description 设置feature样式
   * @param {Object} layer - 图层对象
   * @param {string} directionField - 方向字段
   * @param {string} styleType - 样式的类型
   */
  setFeatureStyle(layer, directionField, styleType) {
    let layerStyle = layer.get('styleOL');
    layer.setStyle((feature) => {
      //有转向字段
      let value, image;
      if (directionField !== undefined && directionField !== '未设置' && directionField !== 'None') {
        value = feature.get('attributes')[directionField];
      } else {
        value = 0;
      }
      if (value > 360 || value < 0) {
        return null;
      }
      if (styleType === 'SYMBOL_POINT') {
        image = layerStyle.getText();
      } else {
        image = layerStyle.getImage();
      }
      //默认用户使用的是角度，换算成弧度
      let rotate = (Math.PI * value) / 180;
      image && image.setRotation(rotate);
      return layerStyle;
    });
  }

  /**
   * @private
   * @function WebMap.prototype.createDataflowHeatLayer
   * @description 创建数据流服务的热力图图层
   * @param {Object} layerInfo - 图层参数
   * @returns {ol.layer.Heatmap} 热力图图层对象
   */
  createDataflowHeatLayer(layerInfo) {
    let source = this.createDataflowHeatSource(layerInfo);
    let layerOptions = {
      source: source
    };
    layerOptions.gradient = layerInfo.themeSetting.colors.slice();
    layerOptions.radius = parseInt(layerInfo.themeSetting.radius);

    if (layerInfo.themeSetting.customSettings) {
      let customSettings = layerInfo.themeSetting.customSettings;
      for (let i in customSettings) {
        layerOptions.gradient[i] = customSettings[i];
      }
    }
    return new olLayer.Heatmap(layerOptions);
  }

  /**
   * @private
   * @function WebMap.prototype.createDataflowHeatSource
   * @description 创建数据流服务的热力图的source
   * @param {Object} layerInfo - 图层参数
   * @returns {ol.souce.Vector} 热力图source对象
   */
  createDataflowHeatSource(layerInfo) {
    let that = this,
      source = new Vector({
        wrapX: false
      });
    let featureCache = {};
    this.createDataflowService(
      layerInfo,
      (function (featureCache) {
        return function (feature) {
          if (layerInfo.filterCondition) {
            //过滤条件
            let condition = that.parseFilterCondition(layerInfo.filterCondition);
            const properties = feature.get('attributes');
            const conditions = parseCondition(condition, Object.keys(properties));
            const filterFeature = parseConditionFeature(properties);
            const sql = 'select * from json where (' + conditions + ')';
            let filterResult = window.jsonsql.query(sql, { attributes: filterFeature });
            if (filterResult && filterResult.length > 0) {
              that.addDataflowFeature(feature, layerInfo.identifyField, {
                dataflowSource: source,
                featureCache: featureCache
              });
            }
          } else {
            that.addDataflowFeature(feature, layerInfo.identifyField, {
              dataflowSource: source,
              featureCache: featureCache
            });
          }
          // 权重字段恢复
          if (layerInfo.themeSetting.weight) {
            that.changeWeight(source.getFeatures(), layerInfo.themeSetting.weight);
          }
        };
      })(featureCache)
    );
    return source;
  }

  /**
   * @private
   * @function WebMap.prototype.addFeatureFromDataflowService
   * @description 将feature添加到数据流图层
   * @param {Object} source - 图层对应的source
   * @param {Object} feature - 需要添加到图层的feature
   * @param {Object} identifyField - feature的标识字段
   * @param {Object} featureCache - 存储已添加到图层的feature对象
   */
  addFeatureFromDataflowService(source, feature, identifyField, featureCache) {
    //判断是否有这个feature，存在feature就更新位置。
    var geoID = feature.get(identifyField);
    if (geoID !== undefined && featureCache[geoID]) {
      /*if(that.addFeatureFinish) {
                 //feature全都加上图层，就缩放范围
                 MapManager.zoomToExtent(LayerUtil.getBoundsFromFeatures(source.getFeatures()));
                 that.addFeatureFinish = false;
             }*/
      featureCache[geoID].setGeometry(feature.getGeometry());
      featureCache[geoID].setProperties(feature.getProperties());
      source.changed();
    } else {
      source.addFeature(feature);
      featureCache[geoID] = feature;
    }
  }
  /**
   * @private
   * @function WebMap.prototype.createDataflowService
   * @description 将feature添加到数据流图层
   * @param {Object} layerInfo - 图层参数
   * @param {Object} callback - 回调函数
   */
  createDataflowService(layerInfo, callback) {
    let that = this;
    let dataflowService = new DataFlowService(layerInfo.wsUrl).initSubscribe();
    dataflowService.on('messageSucceeded', function (e) {
      let geojson = JSON.parse(e.value.data);
      let feature = transformTools.readFeature(geojson, {
        dataProjection: layerInfo.projection || 'EPSG:4326',
        featureProjection: that.baseProjection || 'EPSG:4326'
      });
      feature.setProperties({ attributes: geojson.properties });
      callback(feature);
    });
    layerInfo.dataflowService = dataflowService;
  }

  /**
   * @private
   * @function WebMap.prototype.setEachFeatureDefaultStyle
   * @description 为标注图层上的feature设置样式
   * @param {Array} features - 所以的feature集合
   */
  async setEachFeatureDefaultStyle(features) {
    let that = this;
    features = Util.isArray(features) || features instanceof Collection ? features : [features];
    for (let i = 0; i < features.length; i++) {
      const feature = features[i];
      let geomType = feature.getGeometry().getType().toUpperCase();
      // let styleType = geomType === "POINT" ? 'MARKER' : geomType;
      let defaultStyle = feature.getProperties().useStyle;
      if (defaultStyle) {
        if (geomType === 'POINT' && defaultStyle.text) {
          //说明是文字的feature类型
          geomType = 'TEXT';
        }
        let attributes = that.setFeatureInfo(feature);
        feature.setProperties({
          useStyle: defaultStyle,
          attributes
        });
        //标注图层的feature上需要存一个layerId，为了之后样式应用到图层上使用
        // feature.layerId = timeId;
        if (
          geomType === 'POINT' &&
          defaultStyle.src &&
          defaultStyle.src.indexOf('http://') === -1 &&
          defaultStyle.src.indexOf('https://') === -1
        ) {
          //说明地址不完整
          defaultStyle.src = that.server + defaultStyle.src;
        }
      } else {
        defaultStyle = StyleUtils.getMarkerDefaultStyle(geomType, that.server);
      }
      feature.setStyle(await StyleUtils.toOpenLayersStyle(defaultStyle, geomType));
    }
  }

  /**
   * @private
   * @function WebMap.prototype.setFeatureInfo
   * @description 为feature设置属性
   * @param {Array} feature - 单个feature
   * @returns {Object} 属性
   */
  setFeatureInfo(feature) {
    let attributes = feature.get('attributes'),
      defaultAttr = {
        dataViz_title: '',
        dataViz_description: '',
        dataViz_imgUrl: '',
        dataViz_url: ''
      },
      newAttribute = Object.assign(defaultAttr, attributes);
    let properties = feature.getProperties();
    for (let key in newAttribute) {
      if (properties[key]) {
        newAttribute[key] = properties[key];
        delete properties[key];
      }
    }
    return newAttribute;
  }

  /**
   * @private
   * @function WebMap.prototype.createRankSymbolLayer
   * @description 创建等级符号图层
   * @param {Object} layerInfo - 图层信息
   * @param {Array} features - 添加到图层上的features
   * @returns {ol.layer.Vector} 矢量图层
   */
  async createRankSymbolLayer(layerInfo, features) {
    let styleSource = await this.createRankStyleSource(layerInfo, features, layerInfo.featureType);
    let layer = new olLayer.Vector({
      styleSource,
      source: new Vector({
        features: layerInfo.filterCondition ? this.getFiterFeatures(layerInfo.filterCondition, features) : features,
        wrapX: false
      }),
      renderMode: 'image'
    });
    layer.setStyle((feature) => {
      let styleSource = layer.get('styleSource');
      let themeField = styleSource.parameters.themeSetting.themeField;
      let value = Number(feature.get('attributes')[themeField]);
      let styleGroups = styleSource.styleGroups;
      for (let i = 0, len = styleGroups.length; i < len; i++) {
        if (value >= styleGroups[i].start && value < styleGroups[i].end) {
          return styleSource.styleGroups[i].olStyle;
        }
      }
    });
    return layer;
  }
  /**
   * @private
   * @function WebMap.prototype.createRankSymbolLayer
   * @description 创建等级符号图层的source
   * @param {Object} parameters - 图层信息
   * @param {Array} features - 添加到图层上的features
   * @param {string} featureType - feature的类型
   * @returns {Object} styleGroups
   */
  async createRankStyleSource(parameters, features, featureType) {
    let themeSetting = parameters.themeSetting,
      themeField = themeSetting.themeField;
    let styleGroups = await this.getRankStyleGroup(themeField, features, parameters, featureType);
    return styleGroups ? { parameters, styleGroups } : false;
  }
  /**
   * @private
   * @function WebMap.prototype.getRankStyleGroup
   * @description 获取等级符号的style
   * @param {string} themeField - 分段字段
   * @param {Array} features - 添加到图层上的features
   * @param {Object} parameters - 图层参数
   * @param {string} featureType - feature的类型
   * @returns {Array} stylegroup
   */
  async getRankStyleGroup(themeField, features, parameters, featureType) {
    // 找出所有的单值
    let values = [],
      segements = [],
      style = parameters.style,
      themeSetting = parameters.themeSetting,
      segmentMethod = themeSetting.segmentMethod || this.defaultParameters.themeSetting.segmentMethod,
      segmentCount = themeSetting.segmentCount || this.defaultParameters.themeSetting.segmentCount,
      customSettings = themeSetting.customSettings,
      minR = parameters.themeSetting.minRadius,
      maxR = parameters.themeSetting.maxRadius,
      fillColor = style.fillColor,
      colors = parameters.themeSetting.colors;
    features.forEach((feature) => {
      let attributes = feature.get('attributes'),
        value = attributes[themeField];
      // 过滤掉空值和非数值
      if (value == null || !Util.isNumber(value)) {
        return;
      }
      values.push(Number(value));
    });
    try {
      segements = ArrayStatistic.getArraySegments(values, segmentMethod, segmentCount);
    } catch (error) {
      console.error(error);
    }

    // 处理自定义 分段
    for (let i = 0; i < segmentCount; i++) {
      if (i in customSettings) {
        let startValue = customSettings[i]['segment']['start'],
          endValue = customSettings[i]['segment']['end'];
        startValue != null && (segements[i] = startValue);
        endValue != null && (segements[i + 1] = endValue);
      }
    }

    //生成styleGroup
    let styleGroup = [];
    if (segements && segements.length) {
      let len = segements.length,
        incrementR = (maxR - minR) / (len - 1), // 半径增量
        start,
        end,
        radius = Number(((maxR + minR) / 2).toFixed(2));
      // 获取颜色
      let rangeColors = colors ? ColorsPickerUtil.getGradientColors(colors, len, 'RANGE') : [];
      for (let j = 0; j < len - 1; j++) {
        start = Number(segements[j].toFixed(2));
        end = Number(segements[j + 1].toFixed(2));
        // 这里特殊处理以下分段值相同的情况（即所有字段值相同）
        radius = start === end ? radius : minR + Math.round(incrementR * j);
        // 最后一个分段时将end+0.01，避免取不到最大值
        end = j === len - 2 ? end + 0.01 : end;
        // 处理自定义 半径
        radius = customSettings[j] && customSettings[j].radius ? customSettings[j].radius : radius;
        // 转化成 ol 样式
        style.radius = radius;
        style.fillColor =
          customSettings[j] && customSettings[j].color ? customSettings[j].color : rangeColors[j] || fillColor;
        let olStyle = await StyleUtils.getOpenlayersStyle(style, featureType, true);
        styleGroup.push({ olStyle: olStyle, radius, start, end, fillColor: style.fillColor });
      }
      return styleGroup;
    } else {
      return false;
    }
  }

  /**
   * @private
   * @function WebMap.prototype.checkUploadToRelationship
   * @description 检查是否上传到关系型。
   * @param {string} fileId - 文件的 ID。
   * @returns {Promise<T | never>} 关系型文件一些参数。
   */
  checkUploadToRelationship(fileId) {
    let url = this.getRequestUrl(`${this.server}web/datas/${fileId}/datasets.json`);
    return FetchRequest.get(url, null, {
      withCredentials: this.isCredentail(url)
    })
      .then(function (response) {
        return response.json();
      })
      .then(function (result) {
        return result;
      });
  }
  /**
   * @private
   * @function WebMap.prototype.getDatasources
   * @description 获取关系型文件发布的数据服务中数据源的名称
   * @param {string} url - 获取数据源信息的url
   *  @returns {Promise<T | never>} 数据源名称
   */
  getDatasources(url) {
    let requestUrl = this.getRequestUrl(`${url}/data/datasources.json`);
    return FetchRequest.get(requestUrl, null, {
      withCredentials: this.isCredentail(requestUrl)
    })
      .then(function (response) {
        return response.json();
      })
      .then(function (datasource) {
        let datasourceNames = datasource.datasourceNames;
        return datasourceNames[0];
      });
  }
  /**
   * @private
   * @function WebMap.prototype.getDataService
   * @description 获取上传的数据信息
   * @param {string} fileId - 文件id
   * @param {string} datasetName 数据服务的数据集名称
   *  @returns {Promise<T | never>} 数据的信息
   */
  getDataService(fileId, datasetName) {
    let url = this.getRequestUrl(`${this.server}web/datas/${fileId}.json`);
    return FetchRequest.get(url, null, {
      withCredentials: this.isCredentail(url)
    })
      .then(function (response) {
        return response.json();
      })
      .then(function (result) {
        result.fileId = fileId;
        result.datasetName = datasetName;
        return result;
      });
  }

  /**
   * 请求是否带上cookie
   * @param {string} url 请求地址，必选参数。
   * @param {boolean} proxy 是否需要加上代理，可选参数。
   * @returns { boolean | undefined } 是否带上cookie
   */
  isCredentail(url, proxy) {
    if(proxy || this.isIportalProxyServiceUrl(url) || CommonUtil.isInTheSameDomain(url)) {
      return true
    }
    return;
  }
  /**
   * url是否要带上代理
   * @param {*} url 请求地址，必选参数。 
   * @param {*} proxy 是否需要加上代理，可选参数。 
   * @returns { boolean } 是否带上代理
   */
  isAddProxy(url, proxy) {
    return !CommonUtil.isInTheSameDomain(url) && !this.isIportalProxyServiceUrl(url) && proxy !== false;
  }

  /**
   * @private
   * @function WebMap.prototype.getRootUrl
   * @description 获取请求地址。
   * @param {string} url 请求的地址。
   * @param {boolean | undefined} proxy 是否带上代理。
   * @returns {Promise<T | never>} 请求地址。
   */
  getRequestUrl(url, proxy) {
    url = this.formatUrlWithCredential(url);
    return this.isAddProxy(url, proxy) ? 
    `${this.getProxy()}${encodeURIComponent(url)}`: 
    url
  }

  /**
   * @description 给 URL 带上凭证密钥。
   * @param {string} url - 地址。
   */
  formatUrlWithCredential(url) {
    if (this.credentialValue) {
      //有token之类的配置项
      url =
        url.indexOf('?') === -1
          ? `${url}?${this.credentialKey}=${this.credentialValue}`
          : `${url}&${this.credentialKey}=${this.credentialValue}`;
    }
    return url;
  }

  /**
   * @private
   * @function WebMap.prototype.getProxy
   * @description 获取代理地址
   * @returns {Promise<T | never>} 代理地址
   */
  getProxy(type) {
    if (!type) {
      type = 'json';
    }
    return this.proxy || this.server + `apps/viewer/getUrlResource.${type}?url=`;
  }

  /**
   * @private
   * @function WebMap.prototype.getTileLayerInfo
   * @description 获取地图服务的信息
   * @param {string} url 地图服务的url（没有地图名字）
   * @param {boolean | undefined} proxy 是否需要代理
   * @returns {Promise<T | never>} 地图服务信息
   */
  getTileLayerInfo(url, proxy) {
    let that = this,
      epsgCode = that.baseProjection.split('EPSG:')[1];
    let requestUrl = that.getRequestUrl(`${url}/maps.json`, proxy);
    return FetchRequest.get(requestUrl, null, {
      withCredentials: this.isCredentail(url, proxy)
    })
      .then(function (response) {
        return response.json();
      })
      .then(function (mapInfo) {
        let promises = [];
        if (mapInfo) {
          mapInfo.forEach(function (info) {
            let mapUrl = that.getRequestUrl(
              `${info.path}.json?prjCoordSys=${encodeURI(JSON.stringify({ epsgCode: epsgCode }))}`,
              proxy
            );
            let promise = FetchRequest.get(mapUrl, null, {
              withCredentials: that.isCredentail(mapUrl, proxy)
            })
              .then(function (response) {
                return response.json();
              })
              .then(function (restMapInfo) {
                restMapInfo.url = info.path;
                return restMapInfo;
              });
            promises.push(promise);
          });
        }
        return Promise.all(promises).then(function (allRestMaps) {
          return allRestMaps;
        });
      });
  }

  /**
   * 通过 WKT 参数扩展支持多坐标系。
   *
   * @param {string} wkt 字符串。
   * @param {string} crsCode EPSG 信息，如： "EPSG:4490"。
   *
   * @returns {boolean} 坐标系是否添加成功。
   */
  addProjctionFromWKT(wkt, crsCode) {
    if (typeof wkt !== 'string') {
      //参数类型错误
      return false;
    } else {
      if (wkt === 'EPSG:4326' || wkt === 'EPSG:3857') {
        return true;
      } else {
        let epsgCode = crsCode || this.getEpsgInfoFromWKT(wkt);
        if (epsgCode) {
          proj4.defs(epsgCode, wkt);
          // 重新注册proj4到ol.proj，不然不会生效
          if (olProj4 && olProj4.register) {
            olProj4.register(proj4);
          } else if (window.ol.proj && window.ol.proj.setProj4) {
            window.ol.proj.setProj4(proj4);
          }
          return true;
        } else {
          // 参数类型非wkt标准
          return false;
        }
      }
    }
  }

  /**
   * 通过 WKT 参数获取坐标信息。
   *
   * @param {string} wkt 字符串。
   * @returns {string} EPSG，如："EPSG:4326"。
   */
  getEpsgInfoFromWKT(wkt) {
    if (typeof wkt !== 'string') {
      return false;
    } else if (wkt.indexOf('EPSG') === 0) {
      return wkt;
    } else {
      let lastAuthority = wkt.lastIndexOf('AUTHORITY') + 10,
        endString = wkt.indexOf(']', lastAuthority) - 1;
      if (lastAuthority > 0 && endString > 0) {
        return `EPSG:${wkt.substring(lastAuthority, endString).split(',')[1].substr(1)}`;
      } else {
        return false;
      }
    }
  }

  /**
   * @private
   * @function WebMap.prototype.createMigrationLayer
   * @description 创建迁徙图
   * @param {Object} layerInfo 图层信息
   * @param {Array} features 要素数组
   * @returns {ol.layer} 图层
   */
  createMigrationLayer(layerInfo, features) {
    // 获取图层外包DOM
    if (!window.ol3Echarts.prototype.getContainer) {
      window.ol3Echarts.prototype.getContainer = function () {
        return this.$container;
      };
    }
    // 设置图层可见性
    if (!window.ol3Echarts.prototype.setVisible) {
      window.ol3Echarts.prototype.setVisible = function (visible) {
        if (visible) {
          let options = this.get('options');
          if (options) {
            this.setChartOptions(options);
            this.unset('options');
          }
        } else {
          let options = this.getChartOptions();
          this.set('options', options);
          this.clear();
          this.setChartOptions({});
        }
      };
    }
    // 设置图层层级
    if (!window.ol3Echarts.prototype.setZIndex) {
      window.ol3Echarts.prototype.setZIndex = function (zIndex) {
        let container = this.getContainer();
        if (container) {
          container.style.zIndex = zIndex;
        }
      };
    }
    /**
     * 设置鼠标样式
     * .cursor-default > div {
     *     cursor: default !important;
     * }
     */
    if (!window.ol3Echarts.prototype.setCursor) {
      window.ol3Echarts.prototype.setCursor = function (cursor = 'default') {
        let container = this.getContainer();
        if (container && cursor === 'default') {
          container.classList.add('cursor-default');
        }
      };
    }
    let properties = getFeatureProperties(features);
    let lineData = this.createLinesData(layerInfo, properties);
    let pointData = this.createPointsData(lineData, layerInfo, properties);
    let options = this.createOptions(layerInfo, lineData, pointData);
    let layer = new window.ol3Echarts(options, {
      // hideOnMoving: true,
      // hideOnZooming: true
      //以下三个参数，如果不按照这样设置，会造成不可见图层时，缩放还会出现图层
      hideOnMoving: false,
      hideOnZooming: false,
      forcedPrecomposeRerender: true
    });
    layer.type = 'ECHARTS';
    return layer;
  }

  /**
   * @private
   * @function WebMap.prototype.createOptions
   * @description 创建echarts的options
   * @param {Object} layerInfo 图层信息
   * @param {Array} lineData 线数据
   * @param {Array} pointData 点数据
   * @returns {Object} echarts参数
   */
  createOptions(layerInfo, lineData, pointData) {
    let series;
    let lineSeries = this.createLineSeries(layerInfo, lineData);
    if (pointData && pointData.length) {
      let pointSeries = this.createPointSeries(layerInfo, pointData);
      series = lineSeries.concat(pointSeries);
    } else {
      series = lineSeries.slice();
    }
    let options = {
      series
    };
    return options;
  }

  /**
   * @private
   * @function WebMap.prototype.createLineSeries
   * @description 创建线系列
   * @param {Object} layerInfo 图层参数
   * @param {Array} lineData 线数据
   * @returns {Object} 线系列
   */
  createLineSeries(layerInfo, lineData) {
    let lineSetting = layerInfo.lineSetting;
    let animationSetting = layerInfo.animationSetting;
    let linesSeries = [
      // 轨迹线样式
      {
        name: 'line-series',
        type: 'lines',
        zlevel: 1,
        silent: true,
        effect: {
          show: animationSetting.show,
          constantSpeed: animationSetting.constantSpeed,
          trailLength: 0,
          symbol: animationSetting.symbol,
          symbolSize: animationSetting.symbolSize
        },
        lineStyle: {
          normal: {
            color: lineSetting.color,
            type: lineSetting.type,
            width: lineSetting.width,
            opacity: lineSetting.opacity,
            curveness: lineSetting.curveness
          }
        },
        data: lineData
      }
    ];

    if (lineData.length > MAX_MIGRATION_ANIMATION_COUNT) {
      // linesSeries[0].large = true;
      // linesSeries[0].largeThreshold = 100;
      linesSeries[0].blendMode = 'lighter';
    }

    return linesSeries;
  }

  /**
   * @private
   * @function WebMap.prototype.createPointSeries
   * @description 创建点系列
   * @param {Object} layerInfo 图层参数
   * @param {Array} pointData 点数据
   * @returns {Object} 点系列
   */
  createPointSeries(layerInfo, pointData) {
    let lineSetting = layerInfo.lineSetting;
    let animationSetting = layerInfo.animationSetting;
    let labelSetting = layerInfo.labelSetting;
    let pointSeries = [
      {
        name: 'point-series',
        coordinateSystem: 'geo',
        zlevel: 2,
        silent: true,
        label: {
          normal: {
            show: labelSetting.show,
            position: 'right',
            formatter: '{b}',
            color: labelSetting.color,
            fontFamily: labelSetting.fontFamily
          }
        },
        itemStyle: {
          normal: {
            color: lineSetting.color || labelSetting.color
          }
        },
        data: pointData
      }
    ];

    if (animationSetting.show) {
      // 开启动画
      pointSeries[0].type = 'effectScatter';
      pointSeries[0].rippleEffect = {
        brushType: 'stroke'
      };
    } else {
      // 关闭动画
      pointSeries[0].type = 'scatter';
    }

    return pointSeries;
  }

  /**
   * @private
   * @function WebMap.prototype.createPointsData
   * @param {Array} lineData 线数据
   * @param {Object} layerInfo 图层信息
   * @param {Array} properties 属性
   * @returns {Array} 点数据
   */
  createPointsData(lineData, layerInfo, properties) {
    let data = [],
      labelSetting = layerInfo.labelSetting;
    // 标签隐藏则直接返回
    if (!labelSetting.show || !lineData.length) {
      return data;
    }
    let fromData = [],
      toData = [];
    lineData.forEach((item, idx) => {
      let coords = item.coords,
        fromCoord = coords[0],
        toCoord = coords[1],
        fromProperty = properties[idx][labelSetting.from],
        toProperty = properties[idx][labelSetting.to];
      // 起始字段去重
      let f = fromData.find((d) => {
        return d.value[0] === fromCoord[0] && d.value[1] === fromCoord[1];
      });
      !f &&
        fromData.push({
          name: fromProperty,
          value: fromCoord
        });
      // 终点字段去重
      let t = toData.find((d) => {
        return d.value[0] === toCoord[0] && d.value[1] === toCoord[1];
      });
      !t &&
        toData.push({
          name: toProperty,
          value: toCoord
        });
    });
    data = fromData.concat(toData);
    return data;
  }

  /**
   * @private
   * @function WebMap.prototype.createLinesData
   * @param {Object} layerInfo 图层信息
   * @param {Array} properties 属性
   * @returns {Array} 线数据
   */
  createLinesData(layerInfo, properties) {
    return createLinesData(layerInfo, properties);
  }

  /**
   * @private
   * @function WebMap.prototype.getService
   * @description 获取当前数据发布的服务中的某种类型服务
   * @param {Array.<Object>} services 服务集合
   * @param {string} type 服务类型，RESTDATA, RESTMAP
   * @returns {Object} 服务
   */
  getService(services, type) {
    let service = services.filter((info) => {
      return info && info.serviceType === type;
    });
    return service[0];
  }

  /**
   * @private
   * @function WebMap.prototype.isMvt
   * @description 判断当前能否使用数据服务的mvt上图方式
   * @param {string} serviceUrl 数据服务的地址
   * @param {string} datasetName 数据服务的数据集名称
   * @param {boolean | undefined} proxy 是否带上代理
   * @returns {Object} 数据服务的信息
   */
  isMvt(serviceUrl, datasetName, proxy) {
    let that = this;
    return this.getDatasetsInfo(serviceUrl, datasetName).then((info) => {
      //判断是否和底图坐标系一直
      if (info.epsgCode == that.baseProjection.split('EPSG:')[1]) {
        return FetchRequest.get(that.getRequestUrl(`${info.url}/tilefeature.mvt`, proxy), null, {
          withCredentials: that.isCredentail(info.url, proxy)
        })
          .then(function (response) {
            return response.json();
          })
          .then(function (result) {
            info.isMvt = result.error && result.error.code === 400;
            return info;
          })
          .catch(() => {
            return info;
          });
      }
      return info;
    });
  }

  /**
   * @private
   * @function WebMap.prototype.getDatasetsInfo
   * @description 获取数据集信息
   * @param {string} serviceUrl 数据服务的地址
   * @param {string} datasetName 数据服务的数据集名称
   * @returns {Object} 数据服务的信息
   */
  getDatasetsInfo(serviceUrl, datasetName) {
    let that = this;
    return that.getDatasources(serviceUrl).then(function (datasourceName) {
      //判断mvt服务是否可用
      let url = `${serviceUrl}/data/datasources/${datasourceName}/datasets/${datasetName}.json`;
      return FetchRequest.get(that.getRequestUrl(url), null, {
        withCredentials: that.isCredentail(url)
      })
        .then(function (response) {
          return response.json();
        })
        .then(function (datasetsInfo) {
          return {
            epsgCode: datasetsInfo.datasetInfo.prjCoordSys.epsgCode,
            bounds: datasetsInfo.datasetInfo.bounds,
            url //返回的是原始url，没有代理。因为用于请求mvt
          };
        });
    });
  }

  /**
   * @private
   * @function WebMap.prototype.isRestMapMapboxStyle
   * @description 仅判断是否为restmap mvt地图服务 rest-map服务的Mapbox Style资源地址是这样的： .../iserver/services/map-Population/rest/maps/PopulationDistribution/tileFeature/vectorstyles.json?type=MapBox_GL&styleonly=true
   * @param {Object} layerInfo webmap中的MapStylerLayer
   * @returns {boolean} 是否为restmap mvt地图服务
   */
  isRestMapMapboxStyle(layerInfo) {
    const restMapMVTStr = '/tileFeature/vectorstyles.json?type=MapBox_GL&styleonly=true&tileURLTemplate=ZXY';
    let dataSource = layerInfo.dataSource;
    let layerType = layerInfo.layerType;
    if (
      dataSource &&
      dataSource.type === 'EXTERNAL' &&
      dataSource.url.indexOf(restMapMVTStr) > -1 &&
      (layerType === 'MAPBOXSTYLE' || layerType === 'VECTOR_TILE')
    ) {
      return true;
    }
    return false;
  }
  /**
   * @private
   * @function WebMap.prototype.getMapboxStyleLayerInfo
   * @description 获取mapboxstyle图层信息
   * @param {Object} layerInfo 图层信息
   * @returns {Object}  图层信息
   */
  getMapboxStyleLayerInfo(mapInfo, layerInfo) {
    let _this = this;
    return new Promise((resolve, reject) => {
      return _this
        .getMapLayerExtent(layerInfo)
        .then((layer) => {
          return _this
            .getMapboxStyle(mapInfo, layer)
            .then((styleLayer) => {
              Object.assign(layer, styleLayer);
              resolve(layer);
            })
            .catch((error) => {
              reject(error);
            });
        })
        .catch((error) => {
          reject(error);
        });
    });
  }
  /**
   * @private
   * @function WebMap.prototype.getMapLayerExtent
   * @description 获取mapboxstyle图层信息
   * @param {Object} layerInfo 图层信息
   * @returns {Object}  图层信息
   */
  getMapLayerExtent(layerInfo) {
    const restMapMVTStr = '/tileFeature/vectorstyles.json?type=MapBox_GL&styleonly=true&tileURLTemplate=ZXY';
    let dataSource = layerInfo.dataSource;
    let url = dataSource.url;
    if (this.isRestMapMapboxStyle(layerInfo)) {
      url = url.replace(restMapMVTStr, '');
      url = this.getRequestUrl(url + '.json');
    }
    if (url.indexOf('/restjsr/') > -1 && !/\.json$/.test(url)) {
      url = this.getRequestUrl(url + '.json');
    } else {
      url = this.getRequestUrl(url);
    }

    let credential = layerInfo.credential;
    let credentialValue, keyfix;
    //携带令牌(restmap用的首字母大写，但是这里要用小写)
    if (credential) {
      keyfix = Object.keys(credential)[0];
      credentialValue = credential[keyfix];
      url = `${url}?${keyfix}=${credentialValue}`;
    }

    return FetchRequest.get(url, null, {
      withCredentials: this.isCredentail(url),
      withoutFormatSuffix: true,
      headers: {
        'Content-Type': 'application/json;chartset=uft-8'
      }
    })
      .then(function (response) {
        return response.json();
      })
      .then((result) => {
        layerInfo.visibleScales = result.visibleScales;
        layerInfo.coordUnit = result.coordUnit || 'METER';
        layerInfo.scale = result.scale;
        layerInfo.epsgCode = (result.prjCoordSys && result.prjCoordSys.epsgCode) || '3857';
        layerInfo.bounds = result.bounds || {
          top: 20037508.342789244,
          left: -20037508.342789244,
          bottom: -20037508.342789244,
          leftBottom: {
            x: -20037508.342789244,
            y: -20037508.342789244
          },
          right: 20037508.342789244,
          rightTop: {
            x: 20037508.342789244,
            y: 20037508.342789244
          }
        };
        return layerInfo;
      })
      .catch((error) => {
        throw error;
      });
  }

  /**
   * @private
   * @function WebMap.prototype.getMapboxStyle
   * @description 获取mapboxstyle --- ipt中自定义底图请求mapboxstyle目前有两种url格式
   * rest-map服务的Mapbox Style资源地址是这样的： .../iserver/services/map-Population/rest/maps/PopulationDistribution/tileFeature/vectorstyles.json?type=MapBox_GL&styleonly=true
   * restjsr片服务的Mapbox Style资源地址是这样的：.../iserver/services/map-china400/restjsr/v1/vectortile/maps/China/style.json
   * @param {Object} mapboxstyle图层信息
   * @returns {Object} 图层信息
   */
  getMapboxStyle(mapInfo, layerInfo) {
    let _this = this;
    let url = layerInfo.url || layerInfo.dataSource.url;
    let styleUrl = url;
    if (styleUrl.indexOf('/restjsr/') > -1 && !/\/style\.json$/.test(url)) {
      styleUrl = `${styleUrl}/style.json`;
    }
    styleUrl = this.getRequestUrl(styleUrl);
    let credential = layerInfo.credential;
    //携带令牌(restmap用的首字母大写，但是这里要用小写)
    let credentialValue, keyfix;
    if (credential) {
      keyfix = Object.keys(credential)[0];
      credentialValue = credential[keyfix];
      styleUrl = `${styleUrl}?${keyfix}=${credentialValue}`;
    }

    return FetchRequest.get(styleUrl, null, {
      withCredentials: this.isCredentail(styleUrl),
      withoutFormatSuffix: true,
      headers: {
        'Content-Type': 'application/json;chartset=uft-8'
      }
    })
      .then(function (response) {
        return response.json();
      })
      .then((styles) => {
        _this._matchStyleObject(styles);
        let bounds = layerInfo.bounds;
        // 处理携带令牌的情况
        if (credentialValue) {
          styles.sprite = `${styles.sprite}?${keyfix}=${credentialValue}`;
          let sources = styles.sources;
          let sourcesNames = Object.keys(sources);
          sourcesNames.forEach(function (sourceName) {
            styles.sources[sourceName].tiles.forEach(function (tiles, i) {
              const splicing = tiles.includes('?') ? '&' : '?';
              styles.sources[sourceName].tiles[i] = `${tiles}${splicing}${keyfix}=${credentialValue}`;
            });
          });
        }

        let newLayerInfo = {
          url: url,
          sourceType: 'VECTOR_TILE',
          layerType: 'VECTOR_TILE',
          styles: styles,
          extent: bounds && [bounds.left, bounds.bottom, bounds.right, bounds.top],
          bounds: layerInfo.bounds,
          projection: 'EPSG:' + layerInfo.epsgCode,
          epsgCode: layerInfo.epsgCode,
          name: layerInfo.name
        };
        Object.assign(layerInfo, newLayerInfo);
        if (layerInfo.zIndex > 0) {
          // 过滤styles  非底图mapboxstyle图层才需此处理
          _this.modifyMapboxstyleLayer(mapInfo, layerInfo);
        }
        return layerInfo;
      })
      .catch((error) => {
        return error;
      });
  }

  /**
   * @private
   * @function WebMap.prototype.modifyMapboxstyleLayer
   * @description mapboxstyle图层：1. layer id重复问题  2.叠加图层背景色问题
   * @param {Object} mapInfo 地图信息
   * @param {Object} layerInfo 当前要添加到地图的图层
   */
  modifyMapboxstyleLayer(mapInfo, layerInfo) {
    let that = this;
    if (mapInfo.layers && mapInfo.layers.length === 0) {
      return;
    }
    let curLayers = layerInfo.styles.layers;
    if (!curLayers) {
      return;
    }
    // 非底图，则移除"background"图层
    curLayers = curLayers.filter((layer) => layer.type !== 'background');
    layerInfo.styles.layers = curLayers;
    // 处理mapboxstyle图层layer id重复的情况
    let addedLayersArr = mapInfo.layers
      .filter((layer) => layer.layerType === 'VECTOR_TILE' && layer.zIndex !== layerInfo.zIndex)
      .map((addLayer) => addLayer.styles && addLayer.styles.layers);
    if (!addedLayersArr || (addedLayersArr && addedLayersArr.length === 0)) {
      return;
    }
    addedLayersArr.forEach((layers) => {
      curLayers.forEach((curLayer) => {
        that.renameLayerId(layers, curLayer);
      });
    });
  }
  /**
   * @private
   * @function WebMap.prototype.renameLayerId
   * @description  mapboxstyle图层 ID 重复的 layer 添加后缀编码 (n)[参考mapstudio]。
   * @param {mapboxgl.Layer[]} layers 已添加到地图的图层组。
   * @param {mapboxgl.Layer} curLayer 当前图层。
   */
  renameLayerId(layers, curLayer) {
    if (layers.find((l) => l.id === curLayer.id)) {
      const result = curLayer.id.match(/(.+)\((\w)\)$/);
      if (result) {
        curLayer.id = `${result[1]}(${+result[2] + 1})`;
      } else {
        curLayer.id += '(1)';
      }
      if (layers.find((l) => l.id === curLayer.id)) {
        this.renameLayerId(layers, curLayer);
      }
    }
  }
  /**
   * @private
   * @function mapboxgl.supermap.WebMap.prototype._matchStyleObject
   * @description 恢复 style 为标准格式。
   * @param {Object} style - mapbox 样式。
   */
  _matchStyleObject(style) {
    let { sprite, glyphs } = style;
    if (sprite && typeof sprite === 'object') {
      style.sprite = Object.values(sprite)[0];
    }
    if (glyphs && typeof glyphs === 'object') {
      style.glyphs = Object.values(glyphs)[0];
    }
  }

  /**
   * @private
   * @function WebMap.prototype.renameLayerId
   * @description 判断 URL 是否是 SuperMap iPortal 的代理地址。
   * @param {*} serviceUrl
   */
  isIportalProxyServiceUrl(serviceUrl) {
    if (this.serviceProxy && this.serviceProxy.enable && serviceUrl) {
      let proxyStr = '';
      if (this.serviceProxy.proxyServerRootUrl) {
        proxyStr = `${this.serviceProxy.proxyServerRootUrl}/`;
      } else if (this.serviceProxy.rootUrlPostfix) {
        proxyStr = `${this.serviceProxy.port}/${this.serviceProxy.rootUrlPostfix}/`;
      } else if (!this.serviceProxy.rootUrlPostfix) {
        proxyStr = `${this.serviceProxy.port}/`;
      }
      if (this.serviceProxy.port !== 80) {
        return serviceUrl.indexOf(proxyStr) >= 0;
      } else {
        // 代理端口为80，url中不一定有端口，满足一种情况即可
        return serviceUrl.indexOf(proxyStr) >= 0 || serviceUrl.indexOf(proxyStr.replace(':80', '')) >= 0;
      }
    } else {
      return false;
    }
  }
  /**
   * @private
   * @function WebMap.prototype.getStyleResolutions
   * @description 创建图层分辨率。
   * @param {Object} bounds  图层上下左右范围。
   * @returns {Array} styleResolutions 样式分辨率。
   */
  getStyleResolutions(bounds, minZoom = 0, maxZoom = 22) {
    let styleResolutions = [];
    const TILE_SIZE = 512;
    let temp = Math.abs(bounds.left - bounds.right) / TILE_SIZE;
    for (let i = minZoom; i <= maxZoom; i++) {
      if (i === 0) {
        styleResolutions[i] = temp;
        continue;
      }
      temp = temp / 2;
      styleResolutions[i] = temp;
    }
    return styleResolutions;
  }

  /**
   * @private
   * @function WebMap.prototype.createVisibleResolution
   * @description 创建图层可视分辨率
   * @param {Array.<number>} visibleScales 可视比例尺范围
   * @param {Array} indexbounds
   * @param {Object} bounds  图层上下左右范围
   * @param {string} coordUnit
   * @returns {Array} visibleResolution
   */
  createVisibleResolution(visibleScales, indexbounds, bounds, coordUnit) {
    let visibleResolution = [];
    // 1 设置了地图visibleScales的情况
    if (visibleScales && visibleScales.length > 0) {
      visibleResolution = visibleScales.map((scale) => {
        let value = 1 / scale;
        let res = this.getResFromScale(value, coordUnit);
        return res;
      });
    } else {
      // 2 地图的bounds
      let envelope = this.getEnvelope(indexbounds, bounds);
      visibleResolution = this.getStyleResolutions(envelope);
    }
    return visibleResolution;
  }

  /**
   * @private
   * @function WebMap.prototype.createVisibleResolution
   * @description 图层边界范围
   * @param {Array} indexbounds
   * @param {Object} bounds  图层上下左右范围
   * @returns {Object} envelope
   */
  getEnvelope(indexbounds, bounds) {
    let envelope = {};
    if (indexbounds && indexbounds.length === 4) {
      envelope.left = indexbounds[0];
      envelope.bottom = indexbounds[1];
      envelope.right = indexbounds[2];
      envelope.top = indexbounds[3];
    } else {
      envelope = bounds;
    }
    return envelope;
  }
  /**
   * @private
   * @function WebMap.prototype.createMVTLayer
   * @description 创建矢量瓦片图层
   * @param {Object} layerInfo - 图层信息
   */
  createMVTLayer(layerInfo) {
    let styles = layerInfo.styles;
    const indexbounds = styles && styles.metadata && styles.metadata.indexbounds;
    const visibleResolution = this.createVisibleResolution(
      layerInfo.visibleScales,
      indexbounds,
      layerInfo.bounds,
      layerInfo.coordUnit
    );
    const envelope = this.getEnvelope(indexbounds, layerInfo.bounds);
    const styleResolutions = this.getStyleResolutions(envelope);
    // const origin = [envelope.left, envelope.top];
    let baseUrl = layerInfo.url;
    let paramUrl = baseUrl.split('?')[1];
    if (layerInfo.dataSource.type === 'ARCGIS_VECTORTILE') {
      Object.keys(styles.sources).forEach(function (key) {
        Object.keys(styles.sources[key]).forEach(function(fieldName) {
          if (fieldName === 'url') {
            if (typeof styles.sources[key][fieldName] === 'string' && !CommonUtil.isAbsoluteURL(styles.sources[key][fieldName])) {
              styles.sources[key][fieldName] = CommonUtil.relative2absolute(styles.sources[key][fieldName], baseUrl);
            }
            styles.sources[key][fieldName] = styles.sources[key][fieldName] + (paramUrl ? '?' + paramUrl + '&f=json' : '?f=json');
          }
        });
      });
    }
    let sourceName = Object.keys(styles.sources)[0];
    let checkUrl = styles.sources[sourceName].url || styles.sources[sourceName].tiles[0];
    if (checkUrl && !CommonUtil.isAbsoluteURL(checkUrl)) {
      checkUrl = CommonUtil.relative2absolute(checkUrl, baseUrl);
    }
    const withCredentials = CommonUtil.isInTheSameDomain(checkUrl) || this.isIportalProxyServiceUrl(checkUrl);
    const requestParameters = this.tileRequestParameters && this.tileRequestParameters(checkUrl);
    // 创建MapBoxStyle样式
    let mapboxStyles = new MapboxStyles({
      baseUrl,
      style: styles,
      source: styles.name,
      resolutions: styleResolutions,
      map: this.map,
      withCredentials,
      ...requestParameters
    });
    return new Promise((resolve) => {
      mapboxStyles.on('styleloaded', function () {
        let minResolution = visibleResolution[visibleResolution.length - 1];
        let maxResolution = visibleResolution[0];
        let layer = new olLayer.VectorTile({
          //设置避让参数
          declutter: true,
          source: new VectorTileSuperMapRest({
            baseUrl,
            style: styles,
            withCredentials,
            projection: layerInfo.projection,
            format: new MVT({
              featureClass: olRenderFeature
            }),
            wrapX: false,
            ...requestParameters
          }),
          style: mapboxStyles.featureStyleFuntion,
          visible: layerInfo.visible,
          zIndex: layerInfo.zIndex,
          opacity: layerInfo.opacity,
          minResolution,
          // The maximum resolution (exclusive) below which this layer will be visible.
          maxResolution: maxResolution > 1 ? Math.ceil(maxResolution) : maxResolution * 1.1
        });
        resolve(layer);
      });
    });
  }

  /**
   * @private
   * @function WebMap.prototype.isSupportWebp
   * @description 判断是否支持webP
   * @param {*} url 服务地址
   * @param {*} token 服务token
   * @param {*} proxy
   * @returns {boolean}
   */
  isSupportWebp(url, token, proxy) {
    // 还需要判断浏览器
    let isIE = this.isIE();
    if (
      isIE ||
      (this.isFirefox() && this.getFirefoxVersion() < 65) ||
      (this.isChrome() && this.getChromeVersion() < 32)
    ) {
      return false;
    }
    url = token ? `${url}/tileImage.webp?token=${token}` : `${url}/tileImage.webp`;
    url = this.getRequestUrl(url, proxy);
    return FetchRequest.get(url, null, {
      withCredentials: this.isCredentail(url, proxy),
      withoutFormatSuffix: true
    })
      .then(function (response) {
        if (response.status !== 200) {
          throw response.status;
        }
        return response;
      })
      .then(() => {
        return true;
      })
      .catch(() => {
        return false;
      });
  }
  /**
   * @private
   * @function WebMap.prototype.isIE
   * @description 判断当前浏览器是否为IE
   * @returns {boolean}
   */
  isIE() {
    if (!!window.ActiveXObject || 'ActiveXObject' in window) {
      return true;
    }
    return false;
  }

  /**
   * @private
   * @function WebMap.prototype.isFirefox
   * @description  判断当前浏览器是否为 firefox
   * @returns {boolean}
   */
  isFirefox() {
    let userAgent = navigator.userAgent;
    return userAgent.indexOf('Firefox') > -1;
  }

  /**
   * @private
   * @function WebMap.prototype.isChrome
   * @description  判断当前浏览器是否为谷歌
   * @returns {boolean}
   */
  isChrome() {
    let userAgent = navigator.userAgent;
    return userAgent.indexOf('Chrome') > -1;
  }

  /**
   * @private
   * @function WebMap.prototype.getFirefoxVersion
   * @description 获取火狐浏览器的版本号
   * @returns {number}
   */
  getFirefoxVersion() {
    let userAgent = navigator.userAgent.toLowerCase(),
      version = userAgent.match(/firefox\/([\d.]+)/);
    return +version[1];
  }

  /**
   * @private
   * @function WebMap.prototype.getChromeVersion
   * @description 获取谷歌浏览器版本号
   * @returns {number}
   */
  getChromeVersion() {
    let userAgent = navigator.userAgent.toLowerCase(),
      version = userAgent.match(/chrome\/([\d.]+)/);
    return +version[1];
  }

  /**
   * @private
   * @function WebMap.prototype.addGraticule
   * @description 创建经纬网
   * @param {Object} mapInfo - 地图信息
   */
  addGraticule(mapInfo) {
    if (this.isHaveGraticule) {
      this.createGraticuleLayer(mapInfo.grid.graticule);
      this.layerAdded++;
      const lens = mapInfo.layers ? mapInfo.layers.length : 0;
      this.sendMapToUser(lens);
    }
  }

  /**
   * @private
   * @function WebMap.prototype.createGraticuleLayer
   * @description 创建经纬网图层
   * @param {Object} layerInfo - 图层信息
   * @returns {ol.layer.Vector} 矢量图层
   */
  createGraticuleLayer(layerInfo) {
    const { strokeColor, strokeWidth, lineDash, extent, visible, interval, lonLabelStyle, latLabelStyle } = layerInfo;
    const epsgCode = this.baseProjection;
    // 添加经纬网需要设置extent、worldExtent
    let projection = new olProj.get(epsgCode);
    projection.setExtent(extent);
    projection.setWorldExtent(olProj.transformExtent(extent, epsgCode, 'EPSG:4326'));

    let graticuleOptions = {
      layerID: 'graticule_layer',
      strokeStyle: new StrokeStyle({
        color: strokeColor,
        width: strokeWidth,
        lineDash
      }),
      extent,
      visible: visible,
      intervals: interval,
      showLabels: true,
      zIndex: 9999,
      wrapX: false,
      targetSize: 0
    };
    lonLabelStyle &&
      (graticuleOptions.lonLabelStyle = new Text({
        font: `${lonLabelStyle.fontSize} ${lonLabelStyle.fontFamily}`,
        textBaseline: lonLabelStyle.textBaseline,
        fill: new FillStyle({
          color: lonLabelStyle.fill
        }),
        stroke: new StrokeStyle({
          color: lonLabelStyle.outlineColor,
          width: lonLabelStyle.outlineWidth
        })
      }));
    latLabelStyle &&
      (graticuleOptions.latLabelStyle = new Text({
        font: `${latLabelStyle.fontSize} ${latLabelStyle.fontFamily}`,
        textBaseline: latLabelStyle.textBaseline,
        fill: new FillStyle({
          color: latLabelStyle.fill
        }),
        stroke: new StrokeStyle({
          color: latLabelStyle.outlineColor,
          width: latLabelStyle.outlineWidth
        })
      }));
    const layer = new olLayer.Graticule(graticuleOptions);
    this.map.addLayer(layer);
  }
  /**
   * @private
   * @function WebMap.prototype.getLang
   * @description 检测当前cookie中的语言或者浏览器所用语言
   * @returns {string} 语言名称，如zh-CN
   */
  getLang() {
    if (this.getCookie('language')) {
      const cookieLang = this.getCookie('language');
      return this.formatCookieLang(cookieLang);
    } else {
      const browerLang = navigator.language || navigator.browserLanguage;
      return browerLang;
    }
  }
  /**
   * @private
   * @function WebMap.prototype.getCookie
   * @description 获取cookie中某个key对应的值
   * @returns {string} 某个key对应的值
   */
  getCookie(key) {
    key = key.toLowerCase();
    let value = null;
    let cookies = document.cookie.split(';');
    cookies.forEach(function (cookie) {
      const arr = cookie.split('=');
      if (arr[0].toLowerCase().trim() === key) {
        value = arr[1].trim();
        return;
      }
    });
    return value;
  }
  /**
   * @private
   * @function WebMap.prototype.formatCookieLang
   * @description 将从cookie中获取的lang,转换成全称，如zh=>zh-CN
   * @returns {string} 转换后的语言名称
   */
  formatCookieLang(cookieLang) {
    let lang;
    switch (cookieLang) {
      case 'zh':
        lang = 'zh-CN';
        break;
      case 'ar':
        lang = 'ar-EG';
        break;
      case 'bg':
        lang = 'bg-BG';
        break;
      case 'ca':
        lang = 'ca-ES';
        break;
      case 'cs':
        lang = 'cs-CZ';
        break;
      case 'da':
        lang = 'da-DK';
        break;
      case 'de':
        lang = 'de-DE';
        break;
      case 'el':
        lang = 'el-GR';
        break;
      case 'es':
        lang = 'es-ES';
        break;
      case 'et':
        lang = 'et-EE';
        break;
      case 'fa':
        lang = 'fa-IR';
        break;
      case 'fl':
        lang = 'fi-FI';
        break;
      case 'fr':
        lang = 'fr-FR';
        break;
      case 'he':
        lang = 'he-IL';
        break;
      case 'hu':
        lang = 'hu-HU';
        break;
      case 'id':
        lang = 'id-ID';
        break;
      case 'is':
        lang = 'is-IS';
        break;
      case 'it':
        lang = 'it-IT';
        break;
      case 'ja':
        lang = 'ja-JP';
        break;
      case 'ko':
        lang = 'ko-KR';
        break;
      case 'ku':
        lang = 'ku-IQ';
        break;
      case 'mn':
        lang = 'mn-MN';
        break;
      case 'nb':
        lang = 'nb-NO';
        break;
      case 'ne':
        lang = 'ne-NP';
        break;
      case 'nl':
        lang = 'nl-NL';
        break;
      case 'pl':
        lang = 'pl-PL';
        break;
      case 'pt':
        lang = 'pt-PT';
        break;
      case 'ru':
        lang = 'ru-RU';
        break;
      case 'sk':
        lang = 'sk-SK';
        break;
      case 'sl':
        lang = 'sl-SI';
        break;
      case 'sr':
        lang = 'sr-RS';
        break;
      case 'sv':
        lang = 'sv-SE';
        break;
      case 'th':
        lang = 'th-TH';
        break;
      case 'tr':
        lang = 'tr-TR';
        break;
      case 'uk':
        lang = 'uk-UA';
        break;
      case 'vi':
        lang = 'vi-VN';
        break;
      default:
        lang = 'en-US';
        break;
    }
    return lang;
  }
  isCustomProjection(projection) {
    if (Util.isNumber(projection)) {
      return [-1000, -1].includes(+projection);
    }
    return ['EPSG:-1000', 'EPSG:-1'].includes(projection);
  }

  handleJSONSuffix(url) {
    if (!url.includes('.json')) {
      if (url.includes('?')) {
        let urlArr = url.split('?');
        urlArr[0] = urlArr[0] + '.json';
        url = urlArr.join('?');
      } else {
        url = url + '.json';
      }
    }
    return url;
  }
}
