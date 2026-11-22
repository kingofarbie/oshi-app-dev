
/* =====================================================
   💾 安全なバックアップ取り込み準備
   backup-import.js

   第4版：
   ・推し一覧をID単位で比較
   ・推し詳細をoshiId単位で比較
   ・推し記録を記録ID単位で比較
   ・家計・推し活費を項目別に比較
   ・家族予定を4項目に分けて比較
   ・家族メンバーと予定の参照関係を確認
   ・その他の未対応項目は保留
   ・localStorageをキー単位で比較
   ・メディアをID単位で比較

   ※読み取り専用
   ※保存・追加・上書き・削除は行わない
===================================================== */

(function(){

"use strict";


/* =====================================================
   共通処理
===================================================== */

function hasOwn(object, key){
    return Object.prototype.hasOwnProperty.call(object, key);
}

function isObject(value){
    return value !== null &&
        typeof value === "object" &&
        !Array.isArray(value);
}

function isSame(a, b){
    return JSON.stringify(a) === JSON.stringify(b);
}


/* =====================================================
   ID付き配列の比較
===================================================== */

function compareIdArray(backupItems, currentItems){

    const result = {
        add: [],
        same: [],
        conflict: [],
        invalid: []
    };

    if(!Array.isArray(backupItems)){
        result.invalid.push({
            reason: "バックアップ側が配列ではありません"
        });
        return result;
    }

    if(!Array.isArray(currentItems)){
        currentItems = [];
    }

    const currentMap = new Map();

    currentItems.forEach(item => {

        if(!item || item.id == null) return;

        const id = String(item.id);

        if(!currentMap.has(id)){
            currentMap.set(id, item);
        }

    });

    const backupIds = new Set();

    backupItems.forEach(item => {

        if(!item || item.id == null){

            result.invalid.push(item);
            return;

        }

        const id = String(item.id);

        if(backupIds.has(id)){

            result.invalid.push(item);
            return;

        }

        backupIds.add(id);

        if(!currentMap.has(id)){

            result.add.push(item);
            return;

        }

        const current = currentMap.get(id);

        if(isSame(item, current)){

            result.same.push(item);

        }else{

            result.conflict.push({
                id: id,
                backup: item,
                current: current
            });

        }

    });

    return result;

}


/* =====================================================
   オブジェクトキー単位の比較
===================================================== */

function compareObjectKeys(backupObject, currentObject){

    const result = {
        add: [],
        same: [],
        conflict: [],
        invalid: []
    };

    if(!isObject(backupObject)){

        result.invalid.push({
            reason: "バックアップ側がオブジェクトではありません"
        });

        return result;

    }

    if(!isObject(currentObject)){
        currentObject = {};
    }

    Object.entries(backupObject).forEach(([key, value]) => {

        if(!hasOwn(currentObject, key)){

            result.add.push({
                key: key,
                value: value
            });

        }else if(isSame(value, currentObject[key])){

            result.same.push({
                key: key,
                value: value
            });

        }else{

            result.conflict.push({
                key: key,
                backup: value,
                current: currentObject[key]
            });

        }

    });

    return result;

}


/* =====================================================
   推し記録の形式を解析
   外側の配列 → oshiId → 記録配列
===================================================== */

function flattenRecords(records){

    const result = [];
    const invalid = [];

    if(
        !Array.isArray(records) &&
        (!records || typeof records !== "object")
    ){
        return {
            records: result,
            invalid: [{
                reason: "推し記録の形式が不正です",
                value: records
            }]
        };
    }

    const groups = Array.isArray(records)
        ? records
        : [records];

    groups.forEach((group, groupIndex) => {

        if(
            !group ||
            typeof group !== "object" ||
            Array.isArray(group)
        ){
            invalid.push({
                reason: "推し記録のグループ形式が不正です",
                index: groupIndex,
                value: group
            });
            return;
        }

        Object.entries(group).forEach(([oshiId, items]) => {

            if(!Array.isArray(items)){
                invalid.push({
                    reason: "推し記録の一覧が配列ではありません",
                    oshiId: oshiId,
                    value: items
                });
                return;
            }

            items.forEach((record, recordIndex) => {

                if(
                    !record ||
                    typeof record !== "object" ||
                    Array.isArray(record)
                ){
                    invalid.push({
                        reason: "推し記録の内容が不正です",
                        oshiId: oshiId,
                        index: recordIndex,
                        value: record
                    });
                    return;
                }

                result.push({
                    ...record,
                    oshiId: record.oshiId || oshiId
                });

            });

        });

    });

    return {
        records: result,
        invalid: invalid
    };

}


/* =====================================================
   推し記録のID比較
===================================================== */

function compareOshiRecords(backupRecords, currentRecords){

    const backupResult = flattenRecords(backupRecords);
    const currentResult = flattenRecords(currentRecords);

    const backup = backupResult.records;
    const current = currentResult.records;

    const result = {
        add: [],
        same: [],
        conflict: [],
        invalid: backupResult.invalid,
        currentInvalid: currentResult.invalid
    };

    const currentMap = new Map();

    current.forEach(record => {

        if(!record.id){
            result.currentInvalid.push({
                reason: "PC側の推し記録にIDがありません",
                record: record
            });
            return;
        }

        if(currentMap.has(record.id)){
            result.currentInvalid.push({
                reason: "PC側に同じIDの推し記録があります",
                id: record.id
            });
            return;
        }

        currentMap.set(record.id, record);

    });

    const backupIds = new Set();

    backup.forEach(record => {

        if(!record.id){
            result.invalid.push({
                reason: "スマホ側の推し記録にIDがありません",
                record: record
            });
            return;
        }

        if(backupIds.has(record.id)){
            result.invalid.push({
                reason: "スマホ側に同じIDの推し記録があります",
                id: record.id
            });
            return;
        }

        backupIds.add(record.id);

        const existing = currentMap.get(record.id);

        if(!existing){

            result.add.push(record);
            return;

        }

        if(isSame(record, existing)){

            result.same.push({
                id: record.id,
                backup: record,
                current: existing
            });

        }else{

            result.conflict.push({
                id: record.id,
                backup: record,
                current: existing
            });

        }

    });

    return result;

}


/* =====================================================
   家計・推し活費の比較
===================================================== */

function compareMoneyData(backupMoney, currentMoney){

    const result = {
        add: [],
        same: [],
        conflict: [],
        invalid: [],
        sections: {}
    };

    if(!isObject(backupMoney)){

        result.invalid.push({
            section: "money",
            reason: "バックアップ側のお金データがオブジェクトではありません"
        });

        return result;

    }

    if(currentMoney === undefined){
        currentMoney = {};
    }

    if(!isObject(currentMoney)){

        result.invalid.push({
            section: "money",
            reason: "PC側のお金データがオブジェクトではありません"
        });

        return result;

    }


    /* 配列項目の比較 */

    const arrayKeys = [
        "records",
        "categories",
        "oshiCategories"
    ];

    arrayKeys.forEach(key => {

        if(!hasOwn(backupMoney, key)) return;

        if(
            hasOwn(currentMoney, key) &&
            !Array.isArray(currentMoney[key])
        ){

            result.sections[key] = {
                add: [],
                same: [],
                conflict: [],
                invalid: [{
                    reason: "PC側の保存形式が配列ではありません",
                    section: key
                }]
            };

            return;

        }

        result.sections[key] = compareIdArray(
            backupMoney[key],
            currentMoney[key] || []
        );

    });


    /* 月キー単位の比較 */

    const objectKeys = [
        "monthlySettings",
        "carryovers",
        "adjustments"
    ];

    objectKeys.forEach(key => {

        if(!hasOwn(backupMoney, key)) return;

        if(
            hasOwn(currentMoney, key) &&
            !isObject(currentMoney[key])
        ){

            result.sections[key] = {
                add: [],
                same: [],
                conflict: [],
                invalid: [{
                    reason: "PC側の保存形式がオブジェクトではありません",
                    section: key
                }]
            };

            return;

        }

        result.sections[key] = compareObjectKeys(
            backupMoney[key],
            currentMoney[key] || {}
        );

    });


    /* 各比較結果を全体集計へ反映 */

    Object.entries(result.sections).forEach(
        ([section, comparison]) => {

            comparison.add.forEach(item => {

                result.add.push({
                    section: section,
                    item: item
                });

            });

            comparison.same.forEach(item => {

                result.same.push({
                    section: section,
                    item: item
                });

            });

            comparison.conflict.forEach(item => {

                result.conflict.push({
                    section: section,
                    item: item
                });

            });

            comparison.invalid.forEach(item => {

                result.invalid.push({
                    section: section,
                    item: item
                });

            });

        }
    );


    /* categorySetupVersion */

    if(hasOwn(backupMoney, "categorySetupVersion")){

        const backupValue =
            backupMoney.categorySetupVersion;

        if(!hasOwn(currentMoney, "categorySetupVersion")){

            result.add.push({
                section: "categorySetupVersion",
                key: "categorySetupVersion",
                value: backupValue
            });

        }else if(
            isSame(
                backupValue,
                currentMoney.categorySetupVersion
            )
        ){

            result.same.push({
                section: "categorySetupVersion",
                value: backupValue
            });

        }else{

            result.conflict.push({
                section: "categorySetupVersion",
                backup: backupValue,
                current: currentMoney.categorySetupVersion
            });

        }

    }


    /* 推し表示スロット */

    if(hasOwn(backupMoney, "oshiDisplaySlots")){

        const backupValue =
            backupMoney.oshiDisplaySlots;

        if(!Array.isArray(backupValue)){

            result.invalid.push({
                section: "oshiDisplaySlots",
                reason: "バックアップ側の保存形式が配列ではありません"
            });

        }else if(!hasOwn(currentMoney, "oshiDisplaySlots")){

            result.add.push({
                section: "oshiDisplaySlots",
                key: "oshiDisplaySlots",
                value: backupValue
            });

        }else if(
            !Array.isArray(currentMoney.oshiDisplaySlots)
        ){

            result.invalid.push({
                section: "oshiDisplaySlots",
                reason: "PC側の保存形式が配列ではありません"
            });

        }else if(
            isSame(
                backupValue,
                currentMoney.oshiDisplaySlots
            )
        ){

            result.same.push({
                section: "oshiDisplaySlots",
                value: backupValue
            });

        }else{

            result.conflict.push({
                section: "oshiDisplaySlots",
                backup: backupValue,
                current: currentMoney.oshiDisplaySlots
            });

        }

    }


    /* 未対応のmoney項目は保留 */

    const knownKeys = [
        ...arrayKeys,
        ...objectKeys,
        "categorySetupVersion",
        "oshiDisplaySlots"
    ];

    Object.entries(backupMoney).forEach(([key, value]) => {

        if(knownKeys.includes(key)) return;

        result.conflict.push({
            section: key,
            backup: value,
            current: hasOwn(currentMoney, key)
                ? currentMoney[key]
                : undefined,
            reason: "比較方法が未対応のため保留"
        });

    });

    return result;

}


/* =====================================================
   家族予定の比較
   members / events / rules / exceptions
===================================================== */

function compareFamilySchedule(backupFamily, currentFamily){

    const result = {
        members: {
            add: [],
            same: [],
            conflict: [],
            invalid: []
        },
        events: {
            add: [],
            same: [],
            conflict: [],
            invalid: []
        },
        rules: {
            add: [],
            same: [],
            conflict: [],
            invalid: []
        },
        exceptions: {
            add: [],
            same: [],
            conflict: [],
            invalid: []
        },
        invalid: []
    };

    if(!isObject(backupFamily)){

        result.invalid.push({
            reason: "バックアップ側の家族予定データがオブジェクトではありません"
        });

        return result;

    }

    if(currentFamily === undefined || currentFamily === null){
        currentFamily = {};
    }

    if(!isObject(currentFamily)){

        result.invalid.push({
            reason: "PC側の家族予定データがオブジェクトではありません"
        });

        return result;

    }


    const keys = [
        "members",
        "events",
        "rules",
        "exceptions"
    ];

    const backupLists = {};
    const currentLists = {};
    const validBackupLists = {};
    const invalidCurrentKeys = new Set();


    /* -------------------------------------------------
       配列形式の確認
    ------------------------------------------------- */

    keys.forEach(key => {

        if(!hasOwn(backupFamily, key)){

            backupLists[key] = [];

        }else if(!Array.isArray(backupFamily[key])){

            result.invalid.push({
                section: key,
                reason: "バックアップ側の保存形式が配列ではありません"
            });

            backupLists[key] = [];

        }else{

            backupLists[key] = backupFamily[key];

        }


        if(!hasOwn(currentFamily, key)){

            currentLists[key] = [];

        }else if(!Array.isArray(currentFamily[key])){

            invalidCurrentKeys.add(key);
            currentLists[key] = [];

        }else{

            currentLists[key] = currentFamily[key];

        }

    });


    /* -------------------------------------------------
       バックアップ側レコードの基本形式を確認
    ------------------------------------------------- */

    keys.forEach(key => {

        validBackupLists[key] = [];

        backupLists[key].forEach((item, index) => {

            if(
                !isObject(item) ||
                item.id == null ||
                String(item.id) === ""
            ){

                result.invalid.push({
                    section: key,
                    index: index,
                    value: item,
                    reason: "IDがない、またはレコード形式が不正です"
                });

                return;

            }


            if(
                (key === "events" || key === "rules") &&
                (
                    item.memberId == null ||
                    String(item.memberId) === ""
                )
            ){

                result.invalid.push({
                    section: key,
                    index: index,
                    value: item,
                    reason: "memberIdがありません"
                });

                return;

            }


            if(
                key === "exceptions" &&
                (
                    item.memberId == null ||
                    String(item.memberId) === "" ||
                    item.ruleId == null ||
                    String(item.ruleId) === ""
                )
            ){

                result.invalid.push({
                    section: key,
                    index: index,
                    value: item,
                    reason: "exceptionのmemberIdまたはruleIdがありません"
                });

                return;

            }

            validBackupLists[key].push(item);

        });

    });


    /* -------------------------------------------------
       各項目をID単位で比較
    ------------------------------------------------- */

    keys.forEach(key => {

        if(invalidCurrentKeys.has(key)){

            result[key] = {
                add: [],
                same: [],
                conflict: [],
                invalid: [{
                    reason: "PC側の保存形式が不正なため比較・追加を停止しました"
                }]
            };

            return;

        }

        result[key] = compareIdArray(
            validBackupLists[key],
            currentLists[key]
        );

    });


    /* -------------------------------------------------
       利用可能なメンバーIDを作成
       PC側に存在するメンバーと、
       今回安全に追加できるメンバーだけを対象にする
    ------------------------------------------------- */

    const memberIds = new Set();

    currentLists.members.forEach(item => {

        if(item && item.id != null){
            memberIds.add(String(item.id));
        }

    });

    if(!invalidCurrentKeys.has("members")){

        result.members.add.forEach(item => {

            if(item && item.id != null){
                memberIds.add(String(item.id));
            }

        });

    }


    /* -------------------------------------------------
       利用可能なルールIDを作成
       ID競合しているルールは利用可能にしない
    ------------------------------------------------- */

    const conflictedRuleIds = new Set();

    result.rules.conflict.forEach(item => {

        if(item && item.id != null){
            conflictedRuleIds.add(String(item.id));
        }

    });

    const ruleIds = new Set();

    currentLists.rules.forEach(item => {

        if(
            item &&
            item.id != null &&
            !conflictedRuleIds.has(String(item.id))
        ){

            ruleIds.add(String(item.id));

        }

    });

    if(!invalidCurrentKeys.has("rules")){

        result.rules.add.forEach(item => {

            if(item && item.id != null){
                ruleIds.add(String(item.id));
            }

        });

    }


    /* -------------------------------------------------
       個別予定・繰り返しルールの参照確認
    ------------------------------------------------- */

    ["events", "rules"].forEach(key => {

        result[key].add =
            result[key].add.filter(item => {

                if(memberIds.has(String(item.memberId))){
                    return true;
                }

                result.invalid.push({
                    section: key,
                    id: item.id,
                    reason: "参照先の家族メンバーが見つからないため追加対象外です"
                });

                return false;

            });

    });


    /* -------------------------------------------------
       繰り返し予定の例外の参照確認
       memberId と ruleId の両方が必要
    ------------------------------------------------- */

    result.exceptions.add =
        result.exceptions.add.filter(item => {

            const hasMember =
                memberIds.has(String(item.memberId));

            const hasRule =
                ruleIds.has(String(item.ruleId));

            if(hasMember && hasRule){
                return true;
            }

            result.invalid.push({
                section: "exceptions",
                id: item.id,
                reason: !hasMember
                    ? "参照先の家族メンバーが見つからないため追加対象外です"
                    : "参照先の繰り返し予定ルールが見つからないため追加対象外です"
            });

            return false;

        });


    return result;

}


/* =====================================================
   メインDBの個別比較
   既存データを変更しない読み取り専用
===================================================== */

function compareMainData(backupData){

    const currentRaw =
        localStorage.getItem("oshi_app_data");

    if(currentRaw === null){

        return {
            status: "current-data-missing",
            oshiList: null,
            oshiDetails: null,
            oshiRecords: null,
            familySchedule: null,
            items: {},
            held: [],
            invalid: []
        };

    }

    let currentData;

    try {

        currentData = JSON.parse(currentRaw);

    } catch(error) {

        throw new Error(
            "現在のPCメインデータを解析できません。"
        );

    }

    if(!isObject(currentData)){

        throw new Error(
            "現在のPCメインデータの形式が正しくありません。"
        );

    }

    if(!isObject(backupData.mainData)){

        throw new Error(
            "スマホ側メインデータの形式が正しくありません。"
        );

    }

    const backupMain = backupData.mainData;

    const result = {
        status: "read-only-comparison",
        oshiList: null,
        oshiDetails: null,
        oshiRecords: null,
        familySchedule: null,
        items: {},
        held: [],
        invalid: []
    };


    /* 推し一覧 */

    if(hasOwn(backupMain, "oshiList")){

        result.oshiList = compareIdArray(
            backupMain.oshiList,
            currentData.oshiList
        );

    }


    /* 推し詳細 */

    if(hasOwn(backupMain, "oshiDetails")){

        result.oshiDetails = compareObjectKeys(
            backupMain.oshiDetails,
            currentData.oshiDetails
        );

    }


    /* 推し記録 */

    if(hasOwn(backupMain, "oshiRecords")){

        result.oshiRecords = compareOshiRecords(
            backupMain.oshiRecords,
            currentData.oshiRecords
        );

    }


    const arrayKeys = [
        "events",
        "categories",
        "plannerNotes",
        "plannerStickerPlacements",
        "anniversaryDays"
    ];


    /* ID付き配列 */

    arrayKeys.forEach(key => {

        if(!hasOwn(backupMain, key)) return;

        result.items[key] = compareIdArray(
            backupMain[key],
            currentData[key]
        );

    });


    /* 日付キーの思い出 */

    if(hasOwn(backupMain, "dayMemories")){

        result.items.dayMemories = compareObjectKeys(
            backupMain.dayMemories,
            currentData.dayMemories
        );

    }


    /* 設定 */

    if(hasOwn(backupMain, "settings")){

        result.items.settings = compareObjectKeys(
            backupMain.settings,
            currentData.settings
        );

    }


    /* お気に入り */

    if(hasOwn(backupMain, "favorites")){

        const backup = backupMain.favorites;
        const current = currentData.favorites || {};

        if(!isObject(backup)){

            result.items.favorites = {
                add: [],
                same: [],
                conflict: [],
                invalid: [{
                    reason: "お気に入りの形式が不正です"
                }]
            };

        }else{

            const favoriteResult = {
                add: [],
                same: [],
                conflict: [],
                invalid: []
            };

            Object.entries(backup).forEach(([key, value]) => {

                if(!hasOwn(current, key)){

                    favoriteResult.add.push({
                        key,
                        value
                    });

                }else if(isSame(value, current[key])){

                    favoriteResult.same.push({
                        key,
                        value
                    });

                }else{

                    favoriteResult.conflict.push({
                        key,
                        backup: value,
                        current: current[key]
                    });

                }

            });

            result.items.favorites = favoriteResult;

        }

    }


    /* スポーツ・健康カレンダー */

    ["sportsCalendar", "healthCalendar"].forEach(key => {

        if(!hasOwn(backupMain, key)) return;

        const backup = backupMain[key];
        const current = currentData[key];

        if(!isObject(backup)){

            result.items[key] = {
                add: [],
                same: [],
                conflict: [],
                invalid: [{
                    reason: "データ形式が不正です"
                }]
            };

            return;

        }

        if(!isObject(current)){

            result.items[key] = {
                add: [],
                same: [],
                conflict: [{
                    key: key,
                    backup: backup,
                    current: current
                }],
                invalid: []
            };

            return;

        }

        result.items[key] = {
            add: [],
            same: isSame(backup, current) ? [backup] : [],
            conflict: isSame(backup, current) ? [] : [{
                key: key,
                backup: backup,
                current: current
            }],
            invalid: []
        };

    });


    /* 家計・推し活費 */

    if(hasOwn(backupMain, "money")){

        result.items.money = compareMoneyData(
            backupMain.money,
            currentData.money
        );

    }


    /* 家族予定 */

    if(hasOwn(backupMain, "familySchedule")){

        result.familySchedule = compareFamilySchedule(
            backupMain.familySchedule,
            currentData.familySchedule
        );

    }


    /* 未対応項目は保留 */

    const knownKeys = [
        "oshiList",
        "oshiDetails",
        "oshiRecords",
        ...arrayKeys,
        "dayMemories",
        "settings",
        "favorites",
        "sportsCalendar",
        "healthCalendar",
        "familySchedule",
        "money"
    ];

    Object.entries(backupMain).forEach(([key, value]) => {

        if(knownKeys.includes(key)) return;

        result.held.push({
            key,
            value,
            reason: "比較方法が未対応のため保留"
        });

    });

    return result;

}


/* =====================================================
   localStorage比較
===================================================== */

function compareLocalStorage(backupStorage){

    const result = {
        add: [],
        same: [],
        conflict: [],
        invalid: []
    };

    Object.entries(backupStorage || {})
        .forEach(([key, item]) => {

            if(!item || typeof item !== "object"){

                result.invalid.push(key);
                return;

            }

            if(item.exists === false) return;

            if(key === "oshi_app_data"){

                result.invalid.push({
                    key: key,
                    reason: "メインDBは専用比較を使用"
                });

                return;

            }

            const currentRaw =
                localStorage.getItem(key);

            if(currentRaw === null){

                result.add.push({
                    key: key,
                    value: item.value
                });

                return;

            }

            let currentValue;

            try{

                currentValue = JSON.parse(currentRaw);

            }catch(error){

                currentValue = currentRaw;

            }

            if(isSame(item.value, currentValue)){

                result.same.push(key);

            }else{

                result.conflict.push({
                    key: key,
                    backup: item.value,
                    current: currentValue
                });

            }

        });

    return result;

}


/* =====================================================
   メディア比較
===================================================== */

async function compareMedia(backupMedia){

    const result = {
        add: [],
        sameId: [],
        conflict: [],
        invalid: []
    };

    if(!Array.isArray(backupMedia)){

        result.invalid.push({
            reason: "メディア一覧が配列ではありません"
        });

        return result;

    }

    if(typeof getAllMediaFiles !== "function"){

        throw new Error(
            "既存メディア取得機能が見つかりません。"
        );

    }

    const currentMedia = await getAllMediaFiles();

    const currentMap = new Map();

    currentMedia.forEach(item => {

        if(item && item.id != null){

            currentMap.set(
                String(item.id),
                item
            );

        }

    });

    const backupIds = new Set();

    for(const item of backupMedia){

        if(
            !item ||
            item.id == null ||
            !(item.file instanceof Blob)
        ){

            result.invalid.push(item);
            continue;

        }

        const id = String(item.id);

        if(backupIds.has(id)){

            result.invalid.push(item);
            continue;

        }

        backupIds.add(id);

        if(!currentMap.has(id)){

            result.add.push(item);
            continue;

        }

        /* 同じIDは内容を未検証のため保留 */

        result.sameId.push({
            id: id,
            backup: item,
            current: currentMap.get(id)
        });

    }

    return result;

}


/* =====================================================
   取り込み予定の作成
===================================================== */

async function createImportPreview(backupData){

    if(
        !backupData ||
        backupData.format !== "oshi-app-restore-data"
    ){

        throw new Error(
            "取り込み用データの形式が正しくありません。"
        );

    }

    const mainData = compareMainData(backupData);

    const localStorageResult =
        compareLocalStorage(backupData.localStorage);

    const media =
        await compareMedia(backupData.media);

    const count = {};


    function addCounts(prefix, comparison){

        if(!comparison) return;

        count[prefix + "Add"] =
            comparison.add.length;

        count[prefix + "Same"] =
            comparison.same.length;

        count[prefix + "Conflict"] =
            comparison.conflict.length;

        count[prefix + "Invalid"] =
            comparison.invalid.length;

    }


    addCounts("oshiList", mainData.oshiList);
    addCounts("oshiDetails", mainData.oshiDetails);
    addCounts("oshiRecords", mainData.oshiRecords);


    /* 家族予定4項目の件数 */

    if(mainData.familySchedule){

        [
            "members",
            "events",
            "rules",
            "exceptions"
        ].forEach(key => {

            addCounts(
                "familySchedule" + key,
                mainData.familySchedule[key]
            );

        });

        count.familyScheduleInvalid =
            mainData.familySchedule.invalid.length;

    }else{

        count.familyScheduleInvalid = 0;

    }


    /* その他のメインDB項目 */

    Object.entries(mainData.items || {}).forEach(
        ([key, comparison]) => {

            addCounts(key, comparison);

        }
    );


    count.mainDataHeld =
        mainData.held.length;

    count.mainDataInvalid =
        mainData.invalid.length;


    /* localStorage */

    count.localStorageAdd =
        localStorageResult.add.length;

    count.localStorageSame =
        localStorageResult.same.length;

    count.localStorageConflict =
        localStorageResult.conflict.length;

    count.localStorageInvalid =
        localStorageResult.invalid.length;


    /* メディア */

    count.mediaAdd =
        media.add.length;

    count.mediaSameIdHeld =
        media.sameId.length;

    count.mediaInvalid =
        media.invalid.length;


    return {
        createdAt: new Date().toISOString(),
        mode: "READ_ONLY",
        mainData,
        localStorage: localStorageResult,
        media,
        summary: count
    };

}


/* =====================================================
   公開
===================================================== */

window.BackupImport = {

    createImportPreview:
        createImportPreview

};

})();
