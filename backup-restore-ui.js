/* =========================================================
   推し活手帳
   バックアップ検査・比較・保護バックアップ UI

   読み取り専用比較
   ・メインデータ
   ・推し一覧
   ・推し詳細情報
   ・推し記録
   ・localStorage
   ・写真・動画

   ・ZIP内の取り込み項目選択
   ・選択項目だけの取り込み
   ・全データの保護バックアップ
========================================================= */

(function(){

    let selectedBackupFile = null;
    let inspectedBackupData = null;
    let isRestoring = false;


    /* =====================================================
       共通処理
    ===================================================== */

    function showMessage(message, isError = false){

        const el = document.getElementById(
            "restoreBackupMessage"
        );

        if(!el) return;

        el.textContent = message;
        el.style.color = isError ? "#d33" : "";

    }


    function safeString(value){

        return value === undefined || value === null
            ? ""
            : String(value);

    }


    function normalizeValue(value){

        if(Array.isArray(value)){
            return value.map(normalizeValue);
        }

        if(value && typeof value === "object"){

            const result = {};

            Object.keys(value)
                .sort()
                .forEach(key => {
                    result[key] = normalizeValue(value[key]);
                });

            return result;

        }

        return value;

    }


    function sameValue(a, b){

        return JSON.stringify(normalizeValue(a)) ===
               JSON.stringify(normalizeValue(b));

    }


    function parseStoredValue(value){

        if(typeof value !== "string"){
            return value;
        }

        try{
            return JSON.parse(value);
        }catch(error){
            return value;
        }

    }


    /* =====================================================
       取り込み項目選択画面
    ===================================================== */

    function removeRestoreSelection(){

        const oldPanel = document.getElementById(
            "restoreBackupSelection"
        );

        if(oldPanel){
            oldPanel.remove();
        }

    }


    function getSupportedRestoreItems(){

        return new Set([

            "oshiList",
            "oshiDetails",
            "oshiRecords",

            "events",
            "categories",

            "dayMemories",
            "plannerNotes",
            "plannerStickerPlacements",

            "anniversaryDays",

            "settings",
            "favorites"

        ]);

    }


    function addRestoreCheckbox(
        container,
        id,
        name,
        countLabel
    ){

        const label = document.createElement("label");

        label.style.display = "flex";
        label.style.alignItems = "center";
        label.style.gap = "9px";
        label.style.padding = "8px 4px";
        label.style.cursor = "pointer";
        label.style.borderBottom =
            "1px solid rgba(128,128,128,0.18)";

        const checkbox = document.createElement("input");

        checkbox.type = "checkbox";
        checkbox.value = id;
        checkbox.dataset.restoreItemId = id;

        checkbox.style.flexShrink = "0";
        checkbox.style.width = "18px";
        checkbox.style.height = "18px";

        const text = document.createElement("span");

        text.textContent = countLabel
            ? name + "（" + countLabel + "）"
            : name;

        label.appendChild(checkbox);
        label.appendChild(text);

        container.appendChild(label);

        return checkbox;

    }


    /* =====================================================
       選択状態の取得
    ===================================================== */

    function getSelectedRestoreIds(){

        const panel = document.getElementById(
            "restoreBackupSelection"
        );

        if(!panel){
            return [];
        }

        return Array.from(
            panel.querySelectorAll(
                'input[data-restore-item-id]:checked'
            )
        ).map(input => input.dataset.restoreItemId);

    }


    /* =====================================================
       選択数・実行ボタンの更新
    ===================================================== */

    function updateRestoreSelectionState(){

        const count = document.getElementById(
            "restoreBackupSelectionCount"
        );

        const restoreButton = document.getElementById(
            "startRestoreBackupButton"
        );

        const selected = getSelectedRestoreIds();

        if(count){

            count.textContent =
                "選択中：" + selected.length + "項目";

        }

        if(restoreButton){

            restoreButton.disabled =
                selected.length === 0 ||
                !inspectedBackupData ||
                isRestoring;

        }

    }


    /* =====================================================
       取り込み項目一覧
    ===================================================== */

    function renderRestoreSelectionList(backupData){

        const inspection = document.getElementById(
            "restoreBackupInspection"
        );

        const result = document.getElementById(
            "restoreBackupInspectionResult"
        );

        const restoreButton = document.getElementById(
            "startRestoreBackupButton"
        );

        if(!inspection || !result || !restoreButton){

            throw new Error(
                "取り込み項目選択画面の表示場所が見つかりません。"
            );

        }

        removeRestoreSelection();

        restoreButton.disabled = true;

        const mainData =
            backupData && backupData.mainData &&
            typeof backupData.mainData === "object"
                ? backupData.mainData
                : {};

        const supportedIds = getSupportedRestoreItems();

        if(
            !window.BackupManager ||
            typeof BackupManager.getMainDataItems !== "function" ||
            typeof BackupManager.getSources !== "function"
        ){

            throw new Error(
                "バックアップ項目一覧を取得できません。"
            );

        }

        const registeredItems =
            BackupManager.getMainDataItems();

        const mainItems = registeredItems.filter(item => {

            if(!item || !supportedIds.has(item.id)){
                return false;
            }

            return Object.prototype.hasOwnProperty.call(
                mainData,
                item.id
            );

        });

        const media = Array.isArray(backupData.media)
            ? backupData.media
            : [];

        const sources = BackupManager.getSources();

        const mediaSource = sources.find(
            source => source.id === "media"
        );

        const panel = document.createElement("div");

        panel.id = "restoreBackupSelection";

        panel.style.margin = "16px 0";
        panel.style.padding = "12px";
        panel.style.border =
            "1px solid rgba(128,128,128,0.45)";
        panel.style.borderRadius = "10px";
        panel.style.background = "rgba(128,128,128,0.04)";

        const heading = document.createElement("h4");

        heading.textContent = "📋 取り込む項目を選択";
        heading.style.marginTop = "0";

        panel.appendChild(heading);

        const description = document.createElement("p");

        description.textContent =
            "ZIPに含まれている項目のうち、取り込みたいものを選択してください。";

        panel.appendChild(description);

        const note = document.createElement("p");

        note.textContent =
            "初期状態ではすべて未選択です。";

        note.style.fontSize = "0.9em";
        note.style.opacity = "0.8";

        panel.appendChild(note);

        const checkboxArea = document.createElement("div");

        let previousCategory = "";

        mainItems.forEach(item => {

            const category =
                item.category || "その他";

            if(category !== previousCategory){

                const categoryTitle =
                    document.createElement("p");

                categoryTitle.textContent =
                    "■ " + category;

                categoryTitle.style.fontWeight = "bold";
                categoryTitle.style.margin = "14px 0 4px";

                checkboxArea.appendChild(categoryTitle);

                previousCategory = category;

            }

            addRestoreCheckbox(
                checkboxArea,
                "main:" + item.id,
                item.name || item.id
            );

        });


        /* =====================
           写真・動画
        ===================== */

        if(media.length > 0 && mediaSource){

            const categoryTitle =
                document.createElement("p");

            categoryTitle.textContent = "■ 写真・動画";

            categoryTitle.style.fontWeight = "bold";
            categoryTitle.style.margin = "14px 0 4px";

            checkboxArea.appendChild(categoryTitle);

            addRestoreCheckbox(
                checkboxArea,
                "media",
                mediaSource.name || "写真・動画の実ファイル",
                media.length + "件"
            );

        }


        /* =====================
           対象項目がない場合
        ===================== */

        if(mainItems.length === 0 && media.length === 0){

            const empty = document.createElement("p");

            empty.textContent =
                "このZIPには、現在の取り込み計画が対応している項目がありません。";

            checkboxArea.appendChild(empty);

        }

        panel.appendChild(checkboxArea);


        /* =====================
           選択数表示
        ===================== */

        const count = document.createElement("p");

        count.id = "restoreBackupSelectionCount";
        count.textContent = "選択中：0項目";

        count.style.fontWeight = "bold";
        count.style.marginBottom = "0";

        panel.appendChild(count);


        /* =====================
           選択変更時
        ===================== */

        checkboxArea.addEventListener("change", () => {

            updateRestoreSelectionState();

        });


        /* =====================
           検査結果の直後に表示
        ===================== */

        result.insertAdjacentElement(
            "afterend",
            panel
        );

        inspection.style.display = "block";

        updateRestoreSelectionState();

    }


    /* =====================================================
       メインデータ比較
    ===================================================== */

    function compareMainData(backupData, currentData){

        const backup = backupData || {};
        const current = currentData || {};

        const backupKeys = Object.keys(backup);
        const currentKeys = Object.keys(current);

        const backupOnly = [];
        const currentOnly = [];
        const identical = [];
        const different = [];

        backupKeys.forEach(key => {

            if(!Object.prototype.hasOwnProperty.call(current, key)){
                backupOnly.push(key);
            }else if(sameValue(backup[key], current[key])){
                identical.push(key);
            }else{
                different.push(key);
            }

        });

        currentKeys.forEach(key => {

            if(!Object.prototype.hasOwnProperty.call(backup, key)){
                currentOnly.push(key);
            }

        });

        return {
            backupCount: backupKeys.length,
            currentCount: currentKeys.length,
            backupOnly,
            currentOnly,
            identical,
            different
        };

    }


    /* =====================================================
       推し一覧比較
    ===================================================== */

    function convertOshiList(data){

        if(Array.isArray(data)){
            return data.map(item => ({
                item,
                objectKey: ""
            }));
        }

        if(data && typeof data === "object"){

            if(Array.isArray(data.list)){
                return data.list.map(item => ({
                    item,
                    objectKey: ""
                }));
            }

            if(Array.isArray(data.items)){
                return data.items.map(item => ({
                    item,
                    objectKey: ""
                }));
            }

            return Object.entries(data).map(([key, item]) => ({
                item,
                objectKey: key
            }));

        }

        return [];

    }


    function getOshiInfo(entry){

        const item = entry.item;

        if(!item || typeof item !== "object"){
            return {id: "", name: ""};
        }

        return {
            id: safeString(
                item.id ??
                item.oshiId ??
                item.uid ??
                entry.objectKey
            ),
            name: safeString(
                item.name ??
                item.oshiName ??
                item.title ??
                item.groupName
            )
        };

    }


    function findDuplicateIds(items){

        const counts = new Map();

        items.forEach(item => {

            if(!item.id) return;

            counts.set(
                item.id,
                (counts.get(item.id) || 0) + 1
            );

        });

        return Array.from(counts.entries())
            .filter(([id, count]) => count > 1)
            .map(([id, count]) => ({id, count}));

    }


    function compareOshiListDetail(backupMain, currentMain){

        const backup = convertOshiList(
            backupMain?.oshiList
        ).map(getOshiInfo);

        const current = convertOshiList(
            currentMain?.oshiList
        ).map(getOshiInfo);

        const backupIds = new Set(
            backup.filter(x => x.id).map(x => x.id)
        );

        const currentIds = new Set(
            current.filter(x => x.id).map(x => x.id)
        );

        const backupOnly = [];
        const currentOnly = [];
        const identical = [];
        const nameDifferent = [];

        backup.forEach(item => {

            if(!item.id) return;

            if(!currentIds.has(item.id)){
                backupOnly.push(item);
                return;
            }

            const matched = current.find(
                other => other.id === item.id
            );

            if(matched){

                if(item.name === matched.name){
                    identical.push(item);
                }else{
                    nameDifferent.push({
                        id: item.id,
                        backupName: item.name,
                        currentName: matched.name
                    });
                }

            }

        });

        current.forEach(item => {

            if(item.id && !backupIds.has(item.id)){
                currentOnly.push(item);
            }

        });

        return {
            backupCount: backup.length,
            currentCount: current.length,
            backupItems: backup,
            currentItems: current,
            identical,
            backupOnly,
            currentOnly,
            nameDifferent,
            missingBackupId: backup.filter(x => !x.id),
            missingCurrentId: current.filter(x => !x.id),
            duplicateBackupIds: findDuplicateIds(backup),
            duplicateCurrentIds: findDuplicateIds(current)
        };

    }


    /* =====================================================
       推し詳細情報比較
    ===================================================== */

    function makeOshiDetailsMap(data){

        const result = new Map();

        if(!data || typeof data !== "object"){
            return result;
        }

        if(Array.isArray(data)){

            data.forEach(item => {

                if(!item || typeof item !== "object"){
                    return;
                }

                const id = safeString(
                    item.oshiId ?? item.id
                );

                if(id){
                    result.set(id, item);
                }

            });

            return result;

        }

        Object.entries(data).forEach(([key, value]) => {

            if(value && typeof value === "object"){
                result.set(String(key), value);
            }

        });

        return result;

    }


    function compareOshiDetails(backupData, currentData){

        const backup = makeOshiDetailsMap(backupData);
        const current = makeOshiDetailsMap(currentData);

        const backupOnly = [];
        const currentOnly = [];
        const identical = [];
        const different = [];

        backup.forEach((value, id) => {

            if(!current.has(id)){

                backupOnly.push({
                    oshiId: id,
                    item: value
                });

            }else if(sameValue(value, current.get(id))){

                identical.push({oshiId: id});

            }else{

                different.push({
                    oshiId: id,
                    backup: value,
                    current: current.get(id)
                });

            }

        });

        current.forEach((value, id) => {

            if(!backup.has(id)){
                currentOnly.push({
                    oshiId: id,
                    item: value
                });
            }

        });

        return {
            backupCount: backup.size,
            currentCount: current.size,
            backupOnly,
            currentOnly,
            identical,
            different,
            backupIds: Array.from(backup.keys()),
            currentIds: Array.from(current.keys())
        };

    }


    /* =====================================================
       推し記録の展開
    ===================================================== */

    function flattenRecords(data){

        const result = [];
        const noId = [];

        function visit(value, parentOshiId){

            if(value === null || value === undefined){
                return;
            }

            if(Array.isArray(value)){

                value.forEach(item => {
                    visit(item, parentOshiId);
                });

                return;

            }

            if(typeof value !== "object"){
                return;
            }

            const isRecord =
                typeof value.id === "string" &&
                (
                    Object.prototype.hasOwnProperty.call(value, "oshiId") ||
                    Object.prototype.hasOwnProperty.call(value, "fields") ||
                    Object.prototype.hasOwnProperty.call(value, "type")
                );

            if(isRecord){

                const record = {...value};

                if(!record.oshiId && parentOshiId){
                    record.oshiId = parentOshiId;
                }

                if(record.id){
                    result.push(record);
                }else{
                    noId.push(record);
                }

                return;

            }

            Object.entries(value).forEach(([key, child]) => {

                const nextOshiId =
                    key.startsWith("oshi_")
                        ? key
                        : parentOshiId;

                visit(child, nextOshiId);

            });

        }

        visit(data, "");

        return {
            records: result,
            noId
        };

    }


    function makeRecordMap(data){

        const flattened = flattenRecords(data);

        const map = new Map();
        const duplicates = [];

        flattened.records.forEach(record => {

            const id = safeString(record.id);

            if(!id) return;

            if(map.has(id)){
                duplicates.push(id);
            }else{
                map.set(id, record);
            }

        });

        return {
            map,
            noId: flattened.noId,
            duplicates,
            totalCount:
                flattened.records.length +
                flattened.noId.length
        };

    }


    function countRecordsByOshi(records){

        const counts = new Map();

        records.forEach(record => {

            const oshiId = safeString(record.oshiId);

            if(!oshiId) return;

            counts.set(
                oshiId,
                (counts.get(oshiId) || 0) + 1
            );

        });

        return Array.from(counts.entries())
            .map(([oshiId, count]) => ({
                oshiId,
                count
            }))
            .sort((a, b) =>
                a.oshiId.localeCompare(b.oshiId)
            );

    }


    function compareOshiRecords(backupData, currentData){

        const backup = makeRecordMap(backupData);
        const current = makeRecordMap(currentData);

        const backupOnly = [];
        const currentOnly = [];
        const identical = [];
        const different = [];

        backup.map.forEach((record, id) => {

            if(!current.map.has(id)){

                backupOnly.push({
                    recordId: id,
                    oshiId: safeString(record.oshiId),
                    item: record
                });

                return;

            }

            const currentRecord = current.map.get(id);

            if(sameValue(record, currentRecord)){

                identical.push({
                    recordId: id,
                    oshiId: safeString(record.oshiId)
                });

            }else{

                different.push({
                    recordId: id,
                    backupOshiId: safeString(record.oshiId),
                    currentOshiId: safeString(currentRecord.oshiId),
                    backup: record,
                    current: currentRecord
                });

            }

        });

        current.map.forEach((record, id) => {

            if(!backup.map.has(id)){

                currentOnly.push({
                    recordId: id,
                    oshiId: safeString(record.oshiId),
                    item: record
                });

            }

        });

        return {

            backupCount: backup.totalCount,
            currentCount: current.totalCount,

            identical,
            different,
            backupOnly,
            currentOnly,

            noIdBackup: backup.noId,
            noIdCurrent: current.noId,

            duplicateBackupIds: backup.duplicates,
            duplicateCurrentIds: current.duplicates,

            backupByOshi:
                countRecordsByOshi(
                    Array.from(backup.map.values())
                ),

            currentByOshi:
                countRecordsByOshi(
                    Array.from(current.map.values())
                ),

            backupRecords:
                Array.from(backup.map.values()),

            currentRecords:
                Array.from(current.map.values())

        };

    }


    /* =====================================================
       推しIDの孤立確認
    ===================================================== */

    function findOrphanOshiIds(ids, oshiItems){

        const knownIds = new Set(
            (oshiItems || [])
                .map(item => item.id)
                .filter(Boolean)
        );

        return (ids || []).filter(
            id => !knownIds.has(id)
        );

    }


    function checkDetailsLinks(details, oshiList){

        return {

            backupOrphans: findOrphanOshiIds(
                details.backupIds,
                oshiList.backupItems
            ),

            currentOrphans: findOrphanOshiIds(
                details.currentIds,
                oshiList.currentItems
            )

        };

    }


    function checkRecordsLinks(records, oshiList){

        const backupIds =
            records.backupByOshi.map(x => x.oshiId);

        const currentIds =
            records.currentByOshi.map(x => x.oshiId);

        return {

            backupOrphans: findOrphanOshiIds(
                backupIds,
                oshiList.backupItems
            ),

            currentOrphans: findOrphanOshiIds(
                currentIds,
                oshiList.currentItems
            )

        };

    }


    /* =====================================================
       localStorage比較
    ===================================================== */

    function makeBackupStorageMap(storageData){

        const result = new Map();

        Object.entries(storageData || {})
            .forEach(([storageId, item]) => {

                if(!item || typeof item !== "object"){
                    return;
                }

                const key = storageId;

                if(typeof key !== "string" || !key){
                    return;
                }

                if(key === "oshi_app_data"){
                    return;
                }

                if(item.exists === false){
                    return;
                }

                result.set(key, item.value);

            });

        return result;

    }


    function makeCurrentStorageMap(storageItems){

        const result = new Map();

        (storageItems || []).forEach(item => {

            if(!item || !item.key){
                return;
            }

            if(item.key === "oshi_app_data"){
                return;
            }

            result.set(
                item.key,
                parseStoredValue(item.rawValue)
            );

        });

        return result;

    }


    function compareLocalStorage(backupStorage, currentStorage){

        const backup = makeBackupStorageMap(backupStorage);
        const current = makeCurrentStorageMap(currentStorage);

        const backupOnly = [];
        const currentOnly = [];
        const identical = [];
        const different = [];

        backup.forEach((value, key) => {

            if(!current.has(key)){
                backupOnly.push(key);
            }else if(sameValue(value, current.get(key))){
                identical.push(key);
            }else{
                different.push(key);
            }

        });

        current.forEach((value, key) => {

            if(!backup.has(key)){
                currentOnly.push(key);
            }

        });

        return {
            backupCount: backup.size,
            currentCount: current.size,
            backupOnly,
            currentOnly,
            identical,
            different
        };

    }


    /* =====================================================
       メディア比較
    ===================================================== */

    async function calculateBlobHash(file){

        if(!file || typeof file.arrayBuffer !== "function"){
            throw new Error(
                "メディアファイルを読み取れません。"
            );
        }

        if(!window.crypto?.subtle){
            throw new Error(
                "ファイル内容の比較機能が利用できません。"
            );
        }

        const buffer = await file.arrayBuffer();

        const hash = await crypto.subtle.digest(
            "SHA-256",
            buffer
        );

        return Array.from(new Uint8Array(hash))
            .map(value =>
                value.toString(16).padStart(2, "0")
            )
            .join("");

    }


    function makeMediaMap(records){

        const map = new Map();
        const duplicates = [];

        (records || []).forEach(item => {

            if(!item || item.id === undefined || item.id === null){
                return;
            }

            const id = String(item.id);

            if(map.has(id)){
                duplicates.push(id);
            }else{
                map.set(id, item);
            }

        });

        return {map, duplicates};

    }


    async function compareMedia(backupMedia, currentMedia){

        const backup = makeMediaMap(backupMedia);
        const current = makeMediaMap(currentMedia);

        const backupOnly = [];
        const currentOnly = [];
        const identical = [];
        const different = [];

        for(const [id, backupItem] of backup.map.entries()){

            if(!current.map.has(id)){
                backupOnly.push(id);
                continue;
            }

            const currentItem = current.map.get(id);

            const backupHash = await calculateBlobHash(
                backupItem.file
            );

            const currentHash = await calculateBlobHash(
                currentItem.file
            );

            if(backupHash === currentHash){
                identical.push(id);
            }else{
                different.push(id);
            }

        }

        current.map.forEach((item, id) => {

            if(!backup.map.has(id)){
                currentOnly.push(id);
            }

        });

        return {
            backupCount: backup.map.size,
            currentCount: current.map.size,
            backupOnly,
            currentOnly,
            identical,
            different,
            duplicateBackupIds: backup.duplicates,
            duplicateCurrentIds: current.duplicates
        };

    }


    /* =====================================================
       全体比較
    ===================================================== */

    async function compareBackupData(backupData){

        if(
            !window.BackupSafety ||
            typeof BackupSafety.inspectCurrentData !== "function"
        ){

            throw new Error(
                "現在のPCデータ確認機能がありません。"
            );

        }

        showMessage("現在のPCデータを読み取っています…");

        const currentResult =
            await BackupSafety.inspectCurrentData();

        if(!currentResult || !currentResult.snapshot){
            throw new Error(
                "PCデータを正常に取得できませんでした。"
            );
        }

        const snapshot = currentResult.snapshot;

        const backupMain = backupData.mainData || {};
        const currentMain = snapshot.mainData || {};

        showMessage("メインデータを比較しています…");

        const main = compareMainData(
            backupMain,
            currentMain
        );

        const oshiList = compareOshiListDetail(
            backupMain,
            currentMain
        );

        showMessage("推し詳細情報を比較しています…");

        const oshiDetails = compareOshiDetails(
            backupMain.oshiDetails,
            currentMain.oshiDetails
        );

        const detailsLinks = checkDetailsLinks(
            oshiDetails,
            oshiList
        );

        showMessage("推し記録を比較しています…");

        const oshiRecords = compareOshiRecords(
            backupMain.oshiRecords,
            currentMain.oshiRecords
        );

        const recordsLinks = checkRecordsLinks(
            oshiRecords,
            oshiList
        );

        showMessage("その他の保存データを比較しています…");

        const storage = compareLocalStorage(
            backupData.localStorage,
            snapshot.localStorage
        );

        showMessage("写真・動画の内容を比較しています…");

        const media = await compareMedia(
            backupData.media,
            snapshot.media
        );

        return {
            main,
            oshiList,
            oshiDetails,
            detailsLinks,
            oshiRecords,
            recordsLinks,
            storage,
            media
        };

    }


    /* =====================================================
       表示用
    ===================================================== */

    function formatList(label, values){

        return label + "：" +
            (
                values.length
                    ? values.join("、")
                    : "なし"
            );

    }


    function formatOshiList(label, items){

        const values = (items || []).map(item => {

            return (
                (item.name || "名前なし") +
                "（ID：" +
                (item.id || "IDなし") +
                "）"
            );

        });

        return label + "：" +
            (values.length ? values.join("、") : "なし");

    }


    function formatOwnerCounts(label, items, oshiItems){

        const nameMap = new Map(
            (oshiItems || []).map(item => [
                item.id,
                item.name
            ])
        );

        const values = (items || []).map(item => {

            const name =
                nameMap.get(item.oshiId) || "名前不明";

            return (
                name +
                "（" + item.oshiId + "）：" +
                item.count + "件"
            );

        });

        return label + "：" +
            (values.length ? values.join("、") : "なし");

    }


    function formatRecordList(label, items){

        const values = (items || []).map(item => {

            return (
                "記録ID：" +
                (item.recordId || "不明") +
                " / 推しID：" +
                (item.oshiId || "未設定")
            );

        });

        return label + "：" +
            (values.length ? values.join("、") : "なし");

    }


    /* =====================================================
       比較結果表示
    ===================================================== */

    function showInspectionResult(report, comparison){

        const container = document.getElementById(
            "restoreBackupInspection"
        );

        const result = document.getElementById(
            "restoreBackupInspectionResult"
        );

        if(!container || !result){
            throw new Error(
                "検査結果の表示欄が見つかりません。"
            );
        }

        const lines = [

            "【スマホZIP検査結果】",
            "検査成功",
            "ファイル名：" + report.filename,
            "作成日時：" + report.createdAt,

            "メインデータ：" +
                report.mainDataItems.length + "項目",

            "その他の保存データ：" +
                report.localStorageItems.length + "項目",

            "写真・動画：" +
                report.mediaCount + "件",

            "メディア容量：" +
                (report.mediaSize / 1024 / 1024).toFixed(2) +
                " MB",

            "ZIP内ファイル：" +
                report.zipEntryCount + "件",

            "CRC検証：" +
                report.checkedCRCCount + "件",

            "",
            "====================",
            "【PCとの比較結果】",
            "※まだデータの変更はありません。",

            "",
            "■ メインデータ",

            "スマホ：" + comparison.main.backupCount + "項目",
            "PC：" + comparison.main.currentCount + "項目",
            "一致：" + comparison.main.identical.length + "項目",
            "内容相違：" + comparison.main.different.length + "項目",
            "スマホのみ：" + comparison.main.backupOnly.length + "項目",
            "PCのみ：" + comparison.main.currentOnly.length + "項目",

            formatList(
                "内容が異なる項目",
                comparison.main.different
            ),

            "",
            "====================",
            "⭐【推し一覧の比較】",

            "スマホ登録件数：" +
                comparison.oshiList.backupCount + "件",

            "PC登録件数：" +
                comparison.oshiList.currentCount + "件",

            "共通ID・同じ名前：" +
                comparison.oshiList.identical.length + "件",

            "スマホのみ：" +
                comparison.oshiList.backupOnly.length + "件",

            "PCのみ：" +
                comparison.oshiList.currentOnly.length + "件",

            "同じID・名前相違：" +
                comparison.oshiList.nameDifferent.length + "件",

            formatOshiList(
                "スマホ側",
                comparison.oshiList.backupItems
            ),

            formatOshiList(
                "PC側",
                comparison.oshiList.currentItems
            ),

            formatOshiList(
                "スマホのみ",
                comparison.oshiList.backupOnly
            ),

            formatOshiList(
                "PCのみ",
                comparison.oshiList.currentOnly
            ),

            formatList(
                "スマホ側の重複ID",
                comparison.oshiList.duplicateBackupIds.map(x => x.id)
            ),

            formatList(
                "PC側の重複ID",
                comparison.oshiList.duplicateCurrentIds.map(x => x.id)
            ),

            "",
            "====================",
            "📘【推し詳細情報の比較】",

            "スマホ側：" +
                comparison.oshiDetails.backupCount + "件",

            "PC側：" +
                comparison.oshiDetails.currentCount + "件",

            "内容一致：" +
                comparison.oshiDetails.identical.length + "件",

            "同じ推しID・内容相違：" +
                comparison.oshiDetails.different.length + "件",

            "スマホのみ：" +
                comparison.oshiDetails.backupOnly.length + "件",

            "PCのみ：" +
                comparison.oshiDetails.currentOnly.length + "件",

            formatList(
                "スマホ側の推しID",
                comparison.oshiDetails.backupIds
            ),

            formatList(
                "PC側の推しID",
                comparison.oshiDetails.currentIds
            ),

            formatList(
                "スマホ側の孤立した推しID",
                comparison.detailsLinks.backupOrphans
            ),

            formatList(
                "PC側の孤立した推しID",
                comparison.detailsLinks.currentOrphans
            ),

            "",
            "====================",
            "📝【推し記録の比較】",

            "スマホ側：" +
                comparison.oshiRecords.backupCount + "件",

            "PC側：" +
                comparison.oshiRecords.currentCount + "件",

            "内容一致：" +
                comparison.oshiRecords.identical.length + "件",

            "同じ記録ID・内容相違：" +
                comparison.oshiRecords.different.length + "件",

            "スマホのみ：" +
                comparison.oshiRecords.backupOnly.length + "件",

            "PCのみ：" +
                comparison.oshiRecords.currentOnly.length + "件",

            formatRecordList(
                "スマホのみの記録",
                comparison.oshiRecords.backupOnly
            ),

            formatRecordList(
                "PCのみの記録",
                comparison.oshiRecords.currentOnly
            ),

            formatOwnerCounts(
                "スマホ側・推しごとの記録件数",
                comparison.oshiRecords.backupByOshi,
                comparison.oshiList.backupItems
            ),

            formatOwnerCounts(
                "PC側・推しごとの記録件数",
                comparison.oshiRecords.currentByOshi,
                comparison.oshiList.currentItems
            ),

            "スマホ側・ID未設定記録：" +
                comparison.oshiRecords.noIdBackup.length + "件",

            "PC側・ID未設定記録：" +
                comparison.oshiRecords.noIdCurrent.length + "件",

            formatList(
                "スマホ側の重複記録ID",
                comparison.oshiRecords.duplicateBackupIds
            ),

            formatList(
                "PC側の重複記録ID",
                comparison.oshiRecords.duplicateCurrentIds
            ),

            formatList(
                "スマホ側の孤立した推しID",
                comparison.recordsLinks.backupOrphans
            ),

            formatList(
                "PC側の孤立した推しID",
                comparison.recordsLinks.currentOrphans
            ),

            "",
            "====================",
            "■ その他の保存データ",

            "スマホ：" +
                comparison.storage.backupCount + "キー",

            "PC：" +
                comparison.storage.currentCount + "キー",

            "一致：" +
                comparison.storage.identical.length + "キー",

            "内容相違：" +
                comparison.storage.different.length + "キー",

            "スマホのみ：" +
                comparison.storage.backupOnly.length + "キー",

            "PCのみ：" +
                comparison.storage.currentOnly.length + "キー",

            formatList(
                "内容が異なるキー",
                comparison.storage.different
            ),

            "",
            "====================",
            "■ 写真・動画",

            "スマホ：" +
                comparison.media.backupCount + "件",

            "PC：" +
                comparison.media.currentCount + "件",

            "同一ID・同一内容：" +
                comparison.media.identical.length + "件",

            "同一ID・内容相違：" +
                comparison.media.different.length + "件",

            "スマホのみ：" +
                comparison.media.backupOnly.length + "件",

            "PCのみ：" +
                comparison.media.currentOnly.length + "件",

            formatList(
                "内容が異なるメディアID",
                comparison.media.different
            ),

            "",
            "====================",
            "比較完了。",
            "この処理では保存・追加・上書き・削除はしていません。"

        ];

        result.textContent = lines.join("\n");
        container.style.display = "block";

    }


    /* =====================================================
       ZIP選択後の処理
    ===================================================== */

    async function handleBackupFileChange(event){

        const input = event.target;
        const file = input.files && input.files[0];

        if(!file) return;

        selectedBackupFile = file;
        inspectedBackupData = null;
        window.lastBackupImportPreview = null;

        removeRestoreSelection();

        window.lastBackupMainDataRaw = null;
        window.lastCurrentMainDataRaw = null;

        const button = document.getElementById(
            "startRestoreBackupButton"
        );

        if(button){
            button.disabled = true;
        }

        try{

            /* =====================
               ZIP検査
            ===================== */

            showMessage("ZIPファイルを検査しています…");

            if(
                !window.BackupManager ||
                typeof BackupManager.inspectBackupFile !== "function"
            ){
                throw new Error(
                    "バックアップ検査機能が読み込まれていません。"
                );
            }

            const inspected =
                await BackupManager.inspectBackupFile(file);

            if(
                !inspected ||
                !inspected.report ||
                !inspected.report.valid
            ){
                throw new Error(
                    "ZIPファイルの検査に失敗しました。"
                );
            }

            inspectedBackupData = inspected.backupData;

            console.log(
                "バックアップZIP検査成功:",
                inspected.report
            );


            /* =====================
               PC側データの読み取り
            ===================== */

            let currentMainData = {};

            try{

                currentMainData = JSON.parse(
                    localStorage.getItem("oshi_app_data") || "{}"
                );

            }catch(error){

                throw new Error(
                    "PC側メインデータを読み取れません。"
                );

            }


            /* =====================
               実データを一時公開
               読み取り専用
            ===================== */

            window.lastBackupMainDataRaw =
                inspectedBackupData.mainData;

            window.lastCurrentMainDataRaw =
                currentMainData;

            console.log(
                "📦 ZIP全体の構造:",
                inspectedBackupData
            );

            console.log(
                "📱 ZIP側メインデータの実体:",
                window.lastBackupMainDataRaw
            );

            console.log(
                "📱 ZIP側メインデータのキー:",
                Object.keys(
                    window.lastBackupMainDataRaw || {}
                )
            );

            console.log(
                "💻 PC側メインデータのキー:",
                Object.keys(
                    window.lastCurrentMainDataRaw || {}
                )
            );


            /* =====================
               従来の詳細比較
            ===================== */

            showMessage("PCデータと比較しています…");

            const comparison = await compareBackupData(
                inspectedBackupData
            );

            showInspectionResult(
                inspected.report,
                comparison
            );


            /* =====================
               推し記録の確認
            ===================== */

            console.log(
                "📱 スマホ側oshiRecords実データ:",
                inspectedBackupData.mainData?.oshiRecords
            );

            console.log(
                "💻 PC側oshiRecords実データ:",
                currentMainData.oshiRecords
            );


            /* =====================
               安全な取り込み予定
               読み取り専用
            ===================== */

            showMessage(
                "安全な取り込み予定を確認しています…"
            );

            if(
                !window.BackupImport ||
                typeof BackupImport.createImportPreview !== "function"
            ){
                throw new Error(
                    "安全な取り込み準備機能が読み込まれていません。"
                );
            }

            const importPreview =
                await BackupImport.createImportPreview(
                    inspectedBackupData
                );

            window.lastBackupImportPreview = importPreview;

            console.log(
                "🔐 安全な取り込み予定（読み取り専用）:",
                importPreview
            );

            console.log(
                "🔐 取り込み予定の件数:",
                importPreview.summary
            );

            console.log(
                "📝 推し記録の詳細比較結果:",
                comparison.oshiRecords
            );

            console.log(
                "🔐 新方式の推し記録比較結果:",
                importPreview.mainData.oshiRecords
            );

            console.log(
                "PC・スマホデータ比較結果:",
                comparison
            );


            /* =====================
               取り込み項目選択画面
            ===================== */

            showMessage(
                "ZIP内の取り込み可能な項目を確認しています…"
            );

            renderRestoreSelectionList(
                inspectedBackupData
            );


            /* =====================
               完了
            ===================== */

            showMessage(
                "ZIP検査・PCデータ比較が完了しました。\n" +
                "取り込みたい項目を選択してください。"
            );

        }catch(error){

            selectedBackupFile = null;
            inspectedBackupData = null;
            window.lastBackupImportPreview = null;

            removeRestoreSelection();

            if(button){
                button.disabled = true;
            }

            showMessage(
                "検査・比較エラー：" + error.message,
                true
            );

            console.error(
                "バックアップ検査・比較エラー:",
                error
            );

        }

    }


    /* =====================================================
       ZIP選択ボタン
    ===================================================== */

    window.selectRestoreBackup = function(){

        if(isRestoring){
            return;
        }

        const input = document.getElementById(
            "restoreBackupFile"
        );

        if(!input){

            showMessage(
                "復元用ファイル選択欄が見つかりません。",
                true
            );

            return;

        }

        // 同じZIPを再度選択できるようにする
        input.value = "";

        input.click();

    };


    /* =====================================================
       保護バックアップ検証
    ===================================================== */

    function sameStringItems(a, b){

        if(
            !Array.isArray(a) ||
            !Array.isArray(b) ||
            a.length !== b.length
        ){
            return false;
        }

        const left = [...a].sort();
        const right = [...b].sort();

        return left.every(
            (value, index) => value === right[index]
        );

    }


    function verifySafetyBackup(
        originalReport,
        savedReport,
        savedFile,
        originalFile
    ){

        if(!savedReport || savedReport.valid !== true){
            throw new Error(
                "保存した保護バックアップが正常ではありません。"
            );
        }

        if(savedFile.size !== originalFile.size){
            throw new Error(
                "保存前後のZIP容量が一致しません。"
            );
        }

        if(!sameStringItems(
            originalReport.mainDataItems,
            savedReport.mainDataItems
        )){
            throw new Error(
                "メインデータの検証に失敗しました。"
            );
        }

        if(!sameStringItems(
            originalReport.localStorageItems,
            savedReport.localStorageItems
        )){
            throw new Error(
                "保存データの検証に失敗しました。"
            );
        }

        if(
            originalReport.mediaCount !== savedReport.mediaCount ||
            originalReport.mediaSize !== savedReport.mediaSize ||
            originalReport.zipEntryCount !== savedReport.zipEntryCount ||
            originalReport.checkedCRCCount !== savedReport.checkedCRCCount
        ){
            throw new Error(
                "保護バックアップの内容が一致しません。"
            );
        }

        return true;

    }


    /* =====================================================
       保護バックアップ作成・保存・再検査
    ===================================================== */

    async function createAndVerifySafetyBackup(saveHandle){

        const safetyResult =
            await BackupSafety.createSafetyBackupFile();

        if(
            !safetyResult ||
            !safetyResult.file ||
            !safetyResult.report ||
            safetyResult.report.valid !== true
        ){
            throw new Error(
                "保護バックアップの作成に失敗しました。"
            );
        }

        let writable = null;

        try{

            writable = await saveHandle.createWritable();

            await writable.write(safetyResult.file);

            await writable.close();

            writable = null;

        }catch(error){

            if(writable){

                try{
                    await writable.abort();
                }catch(abortError){
                    console.error(abortError);
                }

            }

            throw error;

        }

        const savedFile = await saveHandle.getFile();

        const savedInspection =
            await BackupManager.inspectBackupFile(savedFile);

        verifySafetyBackup(
            safetyResult.report,
            savedInspection.report,
            savedFile,
            safetyResult.file
        );

        return savedInspection.report;

    }


    /* =====================================================
       保護バックアップファイル名
    ===================================================== */

    function createSafetyFileName(){

        const now = new Date();

        const pad = value =>
            String(value).padStart(2, "0");

        const date =
            now.getFullYear() +
            pad(now.getMonth() + 1) +
            pad(now.getDate());

        const time =
            pad(now.getHours()) +
            pad(now.getMinutes()) +
            pad(now.getSeconds());

        return (
            "推し活手帳_復元前保護バックアップ_" +
            date + "_" + time + ".zip"
        );

    }


    /* =====================================================
       選択項目だけの取り込みデータを作成
    ===================================================== */

    function createSelectedBackupData(selectedIds){

        if(!inspectedBackupData){

            throw new Error(
                "検査済みのZIPデータがありません。"
            );

        }

        const selected = new Set(selectedIds);

        const sourceMain =
            inspectedBackupData.mainData || {};

        const filteredMain = {};

        Object.entries(sourceMain).forEach(([key, value]) => {

            if(selected.has("main:" + key)){

                filteredMain[key] = value;

            }

        });


        /* =====================
           メディア選択
        ===================== */

        const selectedMedia = selected.has("media")
            ? (
                Array.isArray(inspectedBackupData.media)
                    ? inspectedBackupData.media
                    : []
            )
            : [];


        /* =====================
           localStorageは対象外
           現在の実行処理では個別追加に未対応
        ===================== */

        return {

            ...inspectedBackupData,

            mainData: filteredMain,

            localStorage: {},

            media: selectedMedia

        };

    }


    /* =====================================================
       取り込み結果表示
    ===================================================== */

    function showImportSuccess(result){

        const safetyName =
            result.safetyBackup &&
            result.safetyBackup.fileName
                ? result.safetyBackup.fileName
                : "保存済み";

        const mainAdded =
            result.mainData &&
            Array.isArray(result.mainData.addedCandidates)
                ? result.mainData.addedCandidates.length
                : 0;

        const mediaAdded =
            result.media &&
            Number.isFinite(result.media.added)
                ? result.media.added
                : 0;

        const mediaSkipped =
            result.media &&
            Number.isFinite(result.media.skippedExisting)
                ? result.media.skippedExisting
                : 0;

        const lines = [

            "取り込みと保存後の確認が完了しました。",

            "",
            "【保護バックアップ】",
            safetyName,

            "",
            "【取り込み結果】",
            "メインデータ追加候補：" + mainAdded + "件",
            "写真・動画の追加：" + mediaAdded + "件",
            "既存メディアのスキップ：" + mediaSkipped + "件",

            "",
            "既存データの削除・上書きは行っていません。",

            "",
            "別の項目を取り込む場合は、同じZIPをもう一度選択してください。"

        ];

        showMessage(lines.join("\n"));

    }


    /* =====================================================
       実際の取り込み
    ===================================================== */

    window.startRestoreBackup = async function(){

        if(isRestoring){
            return;
        }

        const selectedIds = getSelectedRestoreIds();

        if(selectedIds.length === 0){

            showMessage(
                "取り込む項目を1つ以上選択してください。",
                true
            );

            updateRestoreSelectionState();

            return;

        }

        if(!selectedBackupFile || !inspectedBackupData){

            showMessage(
                "先にバックアップZIPを選択してください。",
                true
            );

            return;

        }

        if(
            !window.BackupImport ||
            typeof BackupImport.createImportPreview !== "function"
        ){

            showMessage(
                "安全な取り込み準備機能がありません。",
                true
            );

            return;

        }

        if(
            !window.BackupImportExecute ||
            typeof BackupImportExecute.executeImport !== "function"
        ){

            showMessage(
                "取り込み実行機能が読み込まれていません。",
                true
            );

            return;

        }

        const restoreButton = document.getElementById(
            "startRestoreBackupButton"
        );

        isRestoring = true;

        if(restoreButton){
            restoreButton.disabled = true;
        }

        try{

            /* =====================
               選択項目だけに絞る
            ===================== */

            showMessage(
                "選択した項目だけを取り込み対象にしています…"
            );

            const selectedBackupData =
                createSelectedBackupData(selectedIds);

            console.log(
                "📦 選択された取り込み項目:",
                selectedIds
            );

            console.log(
                "📦 選択後の取り込みデータ:",
                selectedBackupData
            );


            /* =====================
               選択後のデータで再比較
            ===================== */

            showMessage(
                "選択した項目を現在のPCデータと再比較しています…"
            );

            const selectedPreview =
                await BackupImport.createImportPreview(
                    selectedBackupData
                );

            window.lastBackupImportPreview =
                selectedPreview;

            window.lastBackupImportSelectionPreview =
                selectedPreview;

            console.log(
                "🔐 選択項目だけの取り込み予定:",
                selectedPreview
            );


            /* =====================
               実行直前の確認
            ===================== */

            if(
                !selectedPreview ||
                selectedPreview.mode !== "READ_ONLY"
            ){

                throw new Error(
                    "選択項目の比較結果が正しくありません。"
                );

            }

            if(
                selectedPreview.localStorage &&
                selectedPreview.localStorage.add &&
                selectedPreview.localStorage.add.length > 0
            ){

                throw new Error(
                    "個別保存データが取り込み対象に含まれています。安全のため中止しました。"
                );

            }


            /* =====================
               保護バックアップと取り込み
            ===================== */

            showMessage(
                "PC全体の保護バックアップを作成しています…\n" +
                "保存先を選択してください。"
            );

            const importResult =
                await BackupImportExecute.executeImport(
                    selectedPreview
                );

            if(
                !importResult ||
                importResult.success !== true
            ){

                throw new Error(
                    importResult && importResult.message
                        ? importResult.message
                        : "取り込み処理が正常に完了しませんでした。"
                );

            }


            /* =====================
               成功
            ===================== */

            console.log(
                "✅ 取り込み完了:",
                importResult
            );

            showImportSuccess(importResult);


            /* =====================
               完了後は再実行を防止
               別項目はZIP再選択で対応
            ===================== */

            const panel = document.getElementById(
                "restoreBackupSelection"
            );

            if(panel){

                panel.querySelectorAll(
                    'input[type="checkbox"]'
                ).forEach(input => {

                    input.disabled = true;

                });

            }

            if(restoreButton){
                restoreButton.disabled = true;
            }

        }catch(error){

            console.error(
                "バックアップ取り込みエラー:",
                error
            );

            showMessage(
                "取り込み処理でエラーが発生しました。\n" +
                error.message +
                "\n\n安全確認が必要なため、同じZIPでの再実行は一旦行わず、現在のPCデータを確認してください。",
                true
            );

        }finally{

            isRestoring = false;

            if(restoreButton){

                const panel = document.getElementById(
                    "restoreBackupSelection"
                );

                const hasDisabledCheckbox =
                    panel &&
                    panel.querySelector(
                        'input[type="checkbox"]:disabled'
                    );

                if(!hasDisabledCheckbox){
                    updateRestoreSelectionState();
                }else{
                    restoreButton.disabled = true;
                }

            }

        }

    };


    /* =====================================================
       UI初期化
    ===================================================== */

    window.initRestoreBackupUI = function(){

        const input = document.getElementById(
            "restoreBackupFile"
        );

        if(!input){

            console.error(
                "復元用ファイル選択欄が見つかりません。"
            );

            return false;

        }

        if(input.dataset.restoreHandlerReady !== "true"){

            input.addEventListener(
                "change",
                handleBackupFileChange
            );

            input.dataset.restoreHandlerReady = "true";

        }

        selectedBackupFile = null;
        inspectedBackupData = null;
        isRestoring = false;

        window.lastBackupImportPreview = null;
        window.lastBackupImportSelectionPreview = null;

        input.value = "";

        removeRestoreSelection();

        const button = document.getElementById(
            "startRestoreBackupButton"
        );

        if(button){
            button.disabled = true;
        }

        const inspection = document.getElementById(
            "restoreBackupInspection"
        );

        if(inspection){
            inspection.style.display = "none";
        }

        showMessage("");

        console.log(
            "バックアップ復元UI初期化成功"
        );

        return true;

    };

})();