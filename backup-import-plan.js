
/* =====================================================
   💾 安全な取り込み計画作成
   backup-import-plan.js

   ・PC側の既存データを保持
   ・バックアップ側にしかない項目だけ追加候補にする
   ・同じIDのデータは上書きしない
   ・競合項目は変更しない
   ・家計・推し活費の追加取り込みに対応
   ・家族予定4項目の追加取り込みに対応
   ・比較段階の不正データをエラーとして引き継ぐ
   ・実際の保存処理は行わない
===================================================== */

(function(){

"use strict";


/* =====================================================
   共通処理
===================================================== */

function isObject(value){
    return value !== null &&
        typeof value === "object" &&
        !Array.isArray(value);
}

function cloneJSON(value){
    return JSON.parse(JSON.stringify(value));
}

function hasOwn(object, key){
    return Object.prototype.hasOwnProperty.call(object, key);
}

function getComparisonItems(comparison){
    return comparison && Array.isArray(comparison.add)
        ? comparison.add
        : [];
}


/* =====================================================
   比較結果の不正データをエラーへ反映
===================================================== */

function collectInvalidErrors(preview, errors){

    function addInvalid(label, comparison){

        if(
            !comparison ||
            !Array.isArray(comparison.invalid)
        ){
            return;
        }

        comparison.invalid.forEach(item => {

            let detail = "";

            if(item && typeof item.reason === "string"){
                detail = "：" + item.reason;
            }else if(item && item.id != null){
                detail = "：ID " + item.id;
            }

            errors.push(
                label +
                "：不正なデータがあります" +
                detail
            );

        });

    }


    const main = preview.mainData || {};


    /* -----------------------------------------------
       メインDB全体の不正データ
    ----------------------------------------------- */

    if(Array.isArray(main.invalid)){

        main.invalid.forEach(item => {

            const label =
                item && item.key
                    ? String(item.key)
                    : "メインDB";

            const reason =
                item && item.reason
                    ? "：" + item.reason
                    : "";

            errors.push(
                label + "：不正なデータがあります" + reason
            );

        });

    }


    /* -----------------------------------------------
       推し一覧・推し詳細
    ----------------------------------------------- */

    addInvalid("oshiList", main.oshiList);
    addInvalid("oshiDetails", main.oshiDetails);


    /* -----------------------------------------------
       推し記録
    ----------------------------------------------- */

    addInvalid("oshiRecords", main.oshiRecords);

    if(
        main.oshiRecords &&
        Array.isArray(main.oshiRecords.currentInvalid)
    ){

        main.oshiRecords.currentInvalid.forEach(item => {

            const reason =
                item && item.reason
                    ? "：" + item.reason
                    : "";

            errors.push(
                "oshiRecords：PC側のデータに問題があります" +
                reason
            );

        });

    }


    /* -----------------------------------------------
       メインDB内の各項目
    ----------------------------------------------- */

    const items = main.items || {};

    Object.entries(items).forEach(([key, comparison]) => {

        addInvalid(key, comparison);

    });


    /* -----------------------------------------------
       家計・推し活費
    ----------------------------------------------- */

    const money = items.money;

    if(money){

        addInvalid("money", money);

        const sections = money.sections || {};

        Object.entries(sections).forEach(
            ([key, comparison]) => {

                addInvalid(
                    "money." + key,
                    comparison
                );

            }
        );

    }


    /* -----------------------------------------------
       家族予定
    ----------------------------------------------- */

    const family = main.familySchedule;

    if(family){

        addInvalid("familySchedule", family);

        [
            "members",
            "events",
            "rules",
            "exceptions"
        ].forEach(key => {

            addInvalid(
                "familySchedule." + key,
                family[key]
            );

        });

    }


    /* -----------------------------------------------
       localStorage
    ----------------------------------------------- */

    addInvalid(
        "localStorage",
        preview.localStorage
    );


    /* -----------------------------------------------
       メディア
    ----------------------------------------------- */

    addInvalid(
        "media",
        preview.media
    );

}


/* =====================================================
   ID付き配列へ未登録データだけを追加
===================================================== */

function addArrayItems(target, comparison, label, errors){

    if(!Array.isArray(target)){
        errors.push(label + "：PC側の形式が配列ではありません");
        return;
    }

    const ids = new Set();

    for(const item of target){

        if(!item || item.id == null) continue;

        const id = String(item.id);

        if(ids.has(id)){
            errors.push(
                label + "：PC側に重複IDがあります：" + id
            );
            return;
        }

        ids.add(id);
    }

    for(const item of getComparisonItems(comparison)){

        if(!item || item.id == null){
            errors.push(label + "：追加候補にIDがありません");
            continue;
        }

        const id = String(item.id);

        if(ids.has(id)){
            errors.push(
                label + "：追加候補のIDが既存データと重複：" + id
            );
            continue;
        }

        ids.add(id);
        target.push(cloneJSON(item));
    }
}


/* =====================================================
   オブジェクトの未登録キーだけを追加
===================================================== */

function addObjectItems(target, comparison, label, errors){

    if(!isObject(target)){
        errors.push(label + "：PC側の形式がオブジェクトではありません");
        return;
    }

    for(const item of getComparisonItems(comparison)){

        if(!item || typeof item.key !== "string"){
            errors.push(label + "：追加候補のキーが不正です");
            continue;
        }

        if(hasOwn(target, item.key)){
            errors.push(
                label + "：追加候補のキーが既存と重複：" +
                item.key
            );
            continue;
        }

        target[item.key] = cloneJSON(item.value);
    }

}


/* =====================================================
   💰 家計・推し活費の追加候補作成
===================================================== */

function buildMoneyCandidate(currentMoney, comparison, errors){

    if(!comparison){
        return currentMoney;
    }

    let candidate = currentMoney;

    if(candidate === undefined || candidate === null){
        candidate = {};
    }

    if(!isObject(candidate)){
        errors.push(
            "money：PC側の保存形式がオブジェクトではありません"
        );
        return currentMoney;
    }


    const sections = comparison.sections || {};


    /* -----------------------------------------------
       ID付き配列
       records
       categories
       oshiCategories
    ----------------------------------------------- */

    const arrayKeys = [
        "records",
        "categories",
        "oshiCategories"
    ];

    arrayKeys.forEach(key => {

        const section = sections[key];

        if(!section) return;

        if(!hasOwn(candidate, key)){
            candidate[key] = [];
        }

        if(!Array.isArray(candidate[key])){
            errors.push(
                "money." + key +
                "：PC側の保存形式が配列ではありません"
            );
            return;
        }

        addArrayItems(
            candidate[key],
            section,
            "money." + key,
            errors
        );

    });


    /* -----------------------------------------------
       キー単位のオブジェクト
       monthlySettings
       carryovers
       adjustments
    ----------------------------------------------- */

    const objectKeys = [
        "monthlySettings",
        "carryovers",
        "adjustments"
    ];

    objectKeys.forEach(key => {

        const section = sections[key];

        if(!section) return;

        if(!hasOwn(candidate, key)){
            candidate[key] = {};
        }

        if(!isObject(candidate[key])){
            errors.push(
                "money." + key +
                "：PC側の保存形式がオブジェクトではありません"
            );
            return;
        }

        addObjectItems(
            candidate[key],
            section,
            "money." + key,
            errors
        );

    });


    /* -----------------------------------------------
       categorySetupVersion

       PC側の既存値は変更しない
    ----------------------------------------------- */

    const topLevelAdditions = Array.isArray(comparison.add)
        ? comparison.add
        : [];

    const versionItems = topLevelAdditions.filter(item =>
        item &&
        item.section === "categorySetupVersion"
    );

    if(versionItems.length > 1){

        errors.push(
            "money.categorySetupVersion：" +
            "追加候補が重複しています"
        );

    }else if(versionItems.length === 1){

        const item = versionItems[0];

        if(hasOwn(candidate, "categorySetupVersion")){

            errors.push(
                "money.categorySetupVersion：" +
                "PC側に既存値があるため変更しません"
            );

        }else if(hasOwn(item, "value")){

            candidate.categorySetupVersion =
                cloneJSON(item.value);

        }else{

            errors.push(
                "money.categorySetupVersion：" +
                "追加候補の形式が不正です"
            );

        }

    }


    /* -----------------------------------------------
       oshiDisplaySlots

       配列全体を追加し、既存値は変更しない
    ----------------------------------------------- */

    const slotsItems = topLevelAdditions.filter(item =>
        item &&
        item.section === "oshiDisplaySlots"
    );

    if(slotsItems.length > 1){

        errors.push(
            "money.oshiDisplaySlots：" +
            "追加候補が重複しています"
        );

    }else if(slotsItems.length === 1){

        const item = slotsItems[0];

        if(hasOwn(candidate, "oshiDisplaySlots")){

            errors.push(
                "money.oshiDisplaySlots：" +
                "PC側に既存値があるため変更しません"
            );

        }else if(
            hasOwn(item, "value") &&
            Array.isArray(item.value)
        ){

            candidate.oshiDisplaySlots =
                cloneJSON(item.value);

        }else{

            errors.push(
                "money.oshiDisplaySlots：" +
                "追加候補の形式が配列ではありません"
            );

        }

    }


    return candidate;
}


/* =====================================================
   👨‍👩‍👧‍👦 家族予定の追加候補作成
===================================================== */

function buildFamilyScheduleCandidate(
    currentFamily,
    comparison,
    errors
){

    if(!comparison){
        return currentFamily;
    }


    const keys = [
        "members",
        "events",
        "rules",
        "exceptions"
    ];

    const hasAdditions = keys.some(key =>
        getComparisonItems(comparison[key]).length > 0
    );

    if(!hasAdditions){
        return currentFamily;
    }


    let candidate = currentFamily;


    /* -----------------------------------------------
       家族予定データがまだない場合だけ新規作成
    ----------------------------------------------- */

    if(candidate === undefined || candidate === null){
        candidate = {};
    }

    if(!isObject(candidate)){
        errors.push(
            "familySchedule：PC側の保存形式がオブジェクトではありません"
        );
        return currentFamily;
    }


    /* -----------------------------------------------
       4項目を個別に追加

       members
       events
       rules
       exceptions

       既存配列は変更せず、未登録IDだけ追加する。
    ----------------------------------------------- */

    keys.forEach(key => {

        const section = comparison[key];

        if(!section) return;

        const additions = getComparisonItems(section);

        if(additions.length === 0) return;


        /* -------------------------------------------
           既存プロパティがない場合のみ空配列を用意
        ------------------------------------------- */

        if(!hasOwn(candidate, key)){
            candidate[key] = [];
        }


        if(!Array.isArray(candidate[key])){
            errors.push(
                "familySchedule." + key +
                "：PC側の保存形式が配列ではありません"
            );
            return;
        }


        addArrayItems(
            candidate[key],
            section,
            "familySchedule." + key,
            errors
        );

    });


    return candidate;
}


/* =====================================================
   メインDBの追加候補を組み立てる
===================================================== */

function buildMainDataCandidate(currentData, comparison){

    const candidate = cloneJSON(currentData);
    const errors = [];


    /* -----------------------------------------------
       推し一覧
    ----------------------------------------------- */

    if(comparison.oshiList){

        if(!Array.isArray(candidate.oshiList)){

            errors.push(
                "oshiList：PC側の形式が配列ではありません"
            );

        }else{

            addArrayItems(
                candidate.oshiList,
                comparison.oshiList,
                "oshiList",
                errors
            );

        }

    }


    /* -----------------------------------------------
       推し詳細
    ----------------------------------------------- */

    if(comparison.oshiDetails){

        if(!isObject(candidate.oshiDetails)){

            errors.push(
                "oshiDetails：PC側の形式が不正です"
            );

        }else{

            addObjectItems(
                candidate.oshiDetails,
                comparison.oshiDetails,
                "oshiDetails",
                errors
            );

        }

    }


    /* -----------------------------------------------
       推し記録
    ----------------------------------------------- */

    if(comparison.oshiRecords){

        if(!isObject(candidate.oshiRecords)){

            errors.push(
                "oshiRecords：PC側がオブジェクト形式ではないため保留"
            );

        }else{

            const recordIds = new Set();

            Object.values(candidate.oshiRecords).forEach(records => {

                if(!Array.isArray(records)) return;

                records.forEach(record => {

                    if(record && record.id != null){
                        recordIds.add(String(record.id));
                    }

                });

            });


            getComparisonItems(comparison.oshiRecords).forEach(record => {

                if(
                    !record ||
                    record.id == null ||
                    !record.oshiId
                ){

                    errors.push(
                        "oshiRecords：追加候補の情報が不足しています"
                    );

                    return;

                }

                const id = String(record.id);

                if(recordIds.has(id)){

                    errors.push(
                        "oshiRecords：ID重複のため保留：" + id
                    );

                    return;

                }

                const oshiId = String(record.oshiId);

                if(
                    hasOwn(candidate.oshiRecords, oshiId) &&
                    !Array.isArray(candidate.oshiRecords[oshiId])
                ){

                    errors.push(
                        "oshiRecords：" + oshiId +
                        " の保存形式が不正です"
                    );

                    return;

                }

                if(!hasOwn(candidate.oshiRecords, oshiId)){
                    candidate.oshiRecords[oshiId] = [];
                }

                candidate.oshiRecords[oshiId].push(
                    cloneJSON(record)
                );

                recordIds.add(id);

            });

        }

    }


    /* -----------------------------------------------
       ID付き配列
    ----------------------------------------------- */

    [
        "events",
        "categories",
        "plannerNotes",
        "plannerStickerPlacements",
        "anniversaryDays"
    ].forEach(key => {

        const item = comparison.items[key];

        if(!item) return;

        if(!Array.isArray(candidate[key])){

            errors.push(
                key + "：PC側の形式が配列ではありません"
            );

            return;

        }

        addArrayItems(
            candidate[key],
            item,
            key,
            errors
        );

    });


    /* -----------------------------------------------
       日付キーの思い出
    ----------------------------------------------- */

    if(comparison.items.dayMemories){

        if(!isObject(candidate.dayMemories)){

            errors.push(
                "dayMemories：PC側の形式が不正です"
            );

        }else{

            addObjectItems(
                candidate.dayMemories,
                comparison.items.dayMemories,
                "dayMemories",
                errors
            );

        }

    }


    /* -----------------------------------------------
       設定
    ----------------------------------------------- */

    if(comparison.items.settings){

        if(!isObject(candidate.settings)){

            errors.push(
                "settings：PC側の形式が不正です"
            );

        }else{

            const settingResult = comparison.items.settings;

            addObjectItems(
                candidate.settings,
                settingResult,
                "settings",
                errors
            );


            /*
             * notificationsだけは中の項目単位で追加。
             * PC側に存在する値は変更しない。
             */

            const notificationConflict =
                (settingResult.conflict || []).find(
                    item => item.key === "notifications"
                );

            if(notificationConflict){

                const backupValue =
                    notificationConflict.backup;

                const currentValue =
                    candidate.settings.notifications;

                if(
                    isObject(backupValue) &&
                    isObject(currentValue)
                ){

                    Object.entries(backupValue).forEach(
                        ([key, value]) => {

                            if(!hasOwn(currentValue, key)){
                                currentValue[key] = cloneJSON(value);
                            }

                        }
                    );

                }

            }

        }

    }


    /* -----------------------------------------------
       お気に入り
    ----------------------------------------------- */

    if(comparison.items.favorites){

        if(!isObject(candidate.favorites)){

            errors.push(
                "favorites：PC側の形式が不正です"
            );

        }else{

            addObjectItems(
                candidate.favorites,
                comparison.items.favorites,
                "favorites",
                errors
            );

        }

    }


    /* -----------------------------------------------
       家計・推し活費
    ----------------------------------------------- */

    if(comparison.items.money){

        candidate.money = buildMoneyCandidate(
            candidate.money,
            comparison.items.money,
            errors
        );

    }


    /* -----------------------------------------------
       家族予定
    ----------------------------------------------- */

    if(comparison.familySchedule){

        candidate.familySchedule =
            buildFamilyScheduleCandidate(
                candidate.familySchedule,
                comparison.familySchedule,
                errors
            );

    }


    /*
     * 以下は意図的に変更しない。
     *
     * sportsCalendar
     * healthCalendar
     * 競合中のsettings項目
     * 競合中のfavorites項目
     */

    return {
        candidate,
        errors
    };

}


/* =====================================================
   取り込み計画を作成
===================================================== */

async function createImportPlan(source){

    let preview;


    /* 比較結果を受け取る */

    if(
        source &&
        source.mode === "READ_ONLY" &&
        source.mainData &&
        source.localStorage &&
        source.media
    ){

        preview = source;

    }else if(
        source &&
        source.format === "oshi-app-restore-data"
    ){

        preview =
            await window.BackupImport.createImportPreview(source);

    }else{

        throw new Error(
            "比較結果またはバックアップデータが指定されていません。"
        );

    }


    /* PC側の現在データを取得 */

    const currentRaw =
        localStorage.getItem("oshi_app_data");

    if(currentRaw === null){
        throw new Error(
            "PC側のメインデータがありません"
        );
    }

    let currentData;

    try{

        currentData = JSON.parse(currentRaw);

    }catch(error){

        throw new Error(
            "PC側のメインデータを解析できません"
        );

    }

    if(!isObject(currentData)){
        throw new Error(
            "PC側のメインデータ形式が不正です"
        );
    }


    /* 追加候補を組み立てる */

    const built = buildMainDataCandidate(
        currentData,
        preview.mainData
    );


    /*
     * 比較側で検出された不正データを
     * 取り込み計画のエラーへ引き継ぐ。
     */

    collectInvalidErrors(
        preview,
        built.errors
    );


    /* 比較結果の集計 */

    const summary = preview.summary || {};

    const moneyComparison =
        preview.mainData.items &&
        preview.mainData.items.money;

    const moneyAddCandidates =
        moneyComparison
            ? getComparisonItems(moneyComparison).length
            : 0;


    /* -----------------------------------------------
       家族予定の追加候補数
    ----------------------------------------------- */

    const familyComparison =
        preview.mainData.familySchedule;

    const familyAddCandidates =
        familyComparison
            ? [
                "members",
                "events",
                "rules",
                "exceptions"
            ].reduce((total, key) => {

                return total +
                    getComparisonItems(
                        familyComparison[key]
                    ).length;

            }, 0)
            : 0;


    /* -----------------------------------------------
       家族予定の保留項目
    ----------------------------------------------- */

    const familyHeld = {};

    if(familyComparison){

        [
            "members",
            "events",
            "rules",
            "exceptions"
        ].forEach(key => {

            const section = familyComparison[key];

            familyHeld[key] = {
                conflict:
                    section && Array.isArray(section.conflict)
                        ? section.conflict
                        : [],

                invalid:
                    section && Array.isArray(section.invalid)
                        ? section.invalid
                        : []
            };

        });

        familyHeld.invalid =
            Array.isArray(familyComparison.invalid)
                ? familyComparison.invalid
                : [];

    }


    /* 読み取り専用の取り込み計画 */

    return {

        createdAt: new Date().toISOString(),

        mode: "READ_ONLY_PLAN",

        mainDataCandidate: built.candidate,

        localStorageAdd:
            cloneJSON(preview.localStorage.add),

        mediaAdd:
            preview.media.add.slice(),

        held: {

            mainData:
                preview.mainData.held,

            money:
                moneyComparison
                    ? moneyComparison.conflict
                    : [],

            familySchedule:
                familyHeld,

            localStorage:
                preview.localStorage.conflict,

            mediaSameId:
                preview.media.sameId,

            mediaConflict:
                preview.media.conflict

        },

        errors: built.errors,

        summary: {

            mainDataAddCandidates:
                (summary.oshiListAdd || 0) +
                (summary.oshiDetailsAdd || 0) +
                (summary.oshiRecordsAdd || 0) +
                (summary.eventsAdd || 0) +
                (summary.categoriesAdd || 0) +
                (summary.plannerNotesAdd || 0) +
                (summary.plannerStickerPlacementsAdd || 0) +
                (summary.anniversaryDaysAdd || 0) +
                (summary.dayMemoriesAdd || 0) +
                moneyAddCandidates +
                familyAddCandidates,

            moneyAddCandidates:
                moneyAddCandidates,

            familyScheduleAddCandidates:
                familyAddCandidates,

            familyScheduleMembersAdd:
                getComparisonItems(
                    familyComparison && familyComparison.members
                ).length,

            familyScheduleEventsAdd:
                getComparisonItems(
                    familyComparison && familyComparison.events
                ).length,

            familyScheduleRulesAdd:
                getComparisonItems(
                    familyComparison && familyComparison.rules
                ).length,

            familyScheduleExceptionsAdd:
                getComparisonItems(
                    familyComparison && familyComparison.exceptions
                ).length,

            mediaAddCandidates:
                preview.media.add.length,

            localStorageAddCandidates:
                preview.localStorage.add.length,

            errors:
                built.errors.length

        }

    };

}


/* =====================================================
   公開
===================================================== */

window.BackupImportPlan = {
    createImportPlan
};

})();
