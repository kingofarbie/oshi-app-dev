
/* =====================================================
   💾 推し活・全般データバックアップ
   backup-ui.js

   ・バックアップ項目を個別に選択
   ・大項目単位で一括選択／解除
   ・選択したデータだけを収集
   ・ZIPファイルを作成
   ・保存先を先に選択
   ・保存画面でファイル名を変更可能
   ・非対応ブラウザでは通常ダウンロード

   ※有料会員データとは別機能
   ※既存の保存データは変更しない
===================================================== */

(function(){

"use strict";


/* =====================================================
   1. 初期ファイル名
===================================================== */

function createBackupFileName(){

    const now = new Date();

    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");

    return `推し活_全般データ${year}${month}${day}.zip`;

}


/* =====================================================
   2. ファイル名を安全な形式にする
===================================================== */

function normalizeFileName(name){

    let fileName = String(name || "").trim();

    fileName = fileName.replace(/[\\/:*?"<>|]/g, "_");

    if(!fileName){
        throw new Error("ファイル名を入力してください。");
    }

    if(!fileName.toLowerCase().endsWith(".zip")){
        fileName += ".zip";
    }

    return fileName;

}


/* =====================================================
   3. バックアップ選択画面を作成
===================================================== */

function createBackupSelectionUI(){

    const manager = window.BackupManager;

    if(!manager){
        throw new Error("バックアップ機能が読み込まれていません。");
    }

    if(
        typeof manager.getSources !== "function" ||
        typeof manager.getMainDataItems !== "function"
    ){
        throw new Error("バックアップ項目一覧を取得できません。");
    }

    const sources = manager.getSources();
    const mainItems = manager.getMainDataItems();

    const button =
        document.getElementById("saveAppBackupButton");

    if(!button){
        return false;
    }

    if(document.getElementById("backupSelectionPanel")){
        return true;
    }

    /*
     * main は丸ごと選択しない。
     * メインDBの各項目を個別に選択する。
     */

    const items = [];

    mainItems.forEach(item => {

        if(
            item &&
            typeof item.id === "string" &&
            item.id.length > 0
        ){
            items.push({
                id: item.id,
                name: item.name || item.id,
                category: item.category || "基本データ"
            });
        }

    });

    /*
     * 独立保存データ・写真動画を追加。
     * main は上で個別選択するため除外。
     */

    sources.forEach(source => {

        if(
            !source ||
            source.id === "main" ||
            typeof source.id !== "string" ||
            source.id.length === 0
        ){
            return;
        }

        items.push({
            id: source.id,
            name: source.name || source.id,
            category: source.category || "その他"
        });

    });

    if(items.length === 0){
        throw new Error("バックアップ対象の項目がありません。");
    }

    const panel = document.createElement("div");

    panel.id = "backupSelectionPanel";

    panel.style.cssText = [
        "border:1px solid #ccc",
        "border-radius:12px",
        "padding:14px",
        "margin:12px 0",
        "background:rgba(128,128,128,0.06)"
    ].join(";");

    const heading = document.createElement("h3");
    heading.textContent = "📦 バックアップする項目";
    panel.appendChild(heading);

    const description = document.createElement("p");
    description.textContent =
        "保存したいデータにチェックを入れてください。";
    panel.appendChild(description);

    const count = document.createElement("p");
    count.id = "backupSelectionCount";
    count.style.cssText = "font-size:0.9em;opacity:0.75;";
    panel.appendChild(count);

    const controls = document.createElement("div");
    controls.style.cssText =
        "display:flex;gap:8px;flex-wrap:wrap;margin:10px 0;";

    const allButton = document.createElement("button");
    allButton.type = "button";
    allButton.textContent = "すべて選択";

    const noneButton = document.createElement("button");
    noneButton.type = "button";
    noneButton.textContent = "すべて解除";

    controls.appendChild(allButton);
    controls.appendChild(noneButton);
    panel.appendChild(controls);

    const list = document.createElement("div");
    list.id = "backupSelectionList";

    panel.appendChild(list);

    /*
     * categoryごとにまとめる
     */

    const grouped = {};

    items.forEach(item => {

        if(!grouped[item.category]){
            grouped[item.category] = [];
        }

        grouped[item.category].push(item);

    });

    const checkboxes = [];

    Object.keys(grouped).forEach(category => {

        const section = document.createElement("div");

        section.style.cssText =
            "border-top:1px solid rgba(128,128,128,0.25);padding:10px 0;";

        const groupLabel = document.createElement("label");

        groupLabel.style.cssText =
            "display:flex;align-items:center;gap:8px;font-weight:bold;";

        const groupCheckbox = document.createElement("input");

        groupCheckbox.type = "checkbox";
        groupCheckbox.checked = true;

        groupLabel.appendChild(groupCheckbox);
        groupLabel.appendChild(
            document.createTextNode(category)
        );

        section.appendChild(groupLabel);

        const childList = document.createElement("div");

        childList.style.cssText =
            "display:grid;gap:8px;padding:10px 0 0 24px;";

        const children = [];

        grouped[category].forEach(item => {

            const label = document.createElement("label");

            label.style.cssText =
                "display:flex;align-items:center;gap:8px;";

            const checkbox = document.createElement("input");

            checkbox.type = "checkbox";
            checkbox.checked = true;
            checkbox.dataset.backupId = item.id;

            const name = document.createTextNode(item.name);

            label.appendChild(checkbox);
            label.appendChild(name);

            childList.appendChild(label);

            children.push(checkbox);
            checkboxes.push(checkbox);

            checkbox.addEventListener("change", updateState);

        });

        groupCheckbox.addEventListener("change", function(){

            children.forEach(checkbox => {
                checkbox.checked = groupCheckbox.checked;
            });

            updateState();

        });

        section.appendChild(childList);
        list.appendChild(section);

        groupCheckbox._children = children;

    });


    /* =================================================
       選択状態を更新
    ================================================= */

    function updateState(){

        const selectedCount = checkboxes.filter(
            checkbox => checkbox.checked
        ).length;

        count.textContent =
            `${selectedCount} / ${checkboxes.length} 項目を選択中`;

        const groupCheckboxes =
            list.querySelectorAll("input[type='checkbox']:not([data-backup-id])");

        groupCheckboxes.forEach(groupCheckbox => {

            const children = groupCheckbox._children || [];

            const checkedCount = children.filter(
                checkbox => checkbox.checked
            ).length;

            groupCheckbox.checked =
                children.length > 0 &&
                checkedCount === children.length;

            groupCheckbox.indeterminate =
                checkedCount > 0 &&
                checkedCount < children.length;

        });

    }


    /* =================================================
       すべて選択・解除
    ================================================= */

    allButton.addEventListener("click", function(){

        checkboxes.forEach(checkbox => {
            checkbox.checked = true;
        });

        updateState();

    });

    noneButton.addEventListener("click", function(){

        checkboxes.forEach(checkbox => {
            checkbox.checked = false;
        });

        updateState();

    });


    /*
     * 保存ボタンの直前に表示
     */

    button.parentNode.insertBefore(panel, button);

    updateState();

    return true;

}


/* =====================================================
   4. 選択画面の初期化
===================================================== */

function initBackupSelectionUI(){

    try{

        if(createBackupSelectionUI()){
            return true;
        }

    }catch(error){

        console.error("バックアップ選択画面エラー:", error);

    }

    return false;

}


/*
 * 設定画面が後から読み込まれる場合にも対応
 */

function observeBackupButton(){

    if(initBackupSelectionUI()){
        return;
    }

    if(!document.body || !window.MutationObserver){
        return;
    }

    const observer = new MutationObserver(function(){

        if(initBackupSelectionUI()){
            observer.disconnect();
        }

    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });

}


/* =====================================================
   5. 選択されたデータを収集してZIPを作成
===================================================== */

async function createGeneralBackup(){

    const manager = window.BackupManager;

    if(!manager){
        throw new Error("バックアップ機能が読み込まれていません。");
    }

    if(
        typeof manager.collectSelectedData !== "function" ||
        typeof manager.createZipBlob !== "function"
    ){
        throw new Error("バックアップ機能の準備ができていません。");
    }

    const panel =
        document.getElementById("backupSelectionPanel");

    if(!panel){
        throw new Error("バックアップ項目の選択画面がありません。");
    }

    const selectedIds = Array.from(
        panel.querySelectorAll(
            "input[data-backup-id]:checked"
        )
    ).map(checkbox => checkbox.dataset.backupId);

    if(selectedIds.length === 0){
        throw new Error("バックアップする項目を1つ以上選択してください。");
    }

    const backupData =
        await manager.collectSelectedData(selectedIds);

    const zipBlob =
        await manager.createZipBlob(backupData);

    return zipBlob;

}


/* =====================================================
   6. 通常ダウンロード
===================================================== */

function downloadBackup(blob, fileName){

    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");

    link.href = url;
    link.download = fileName;

    document.body.appendChild(link);
    link.click();
    link.remove();

    setTimeout(function(){
        URL.revokeObjectURL(url);
    }, 60000);

}


/* =====================================================
   7. バックアップ実行
===================================================== */

window.saveAppBackup = async function(){

    const button =
        document.getElementById("saveAppBackupButton");

    const message =
        document.getElementById("saveAppBackupMessage");

    if(button){
        button.disabled = true;
        button.textContent = "⏳ バックアップ準備中...";
    }

    try{

        /*
         * 選択画面がまだなければ初期化
         */

        if(!document.getElementById("backupSelectionPanel")){
            initBackupSelectionUI();
        }

        let saveHandle = null;

        /*
         * 保存先選択画面を最初に開く
         */

        if(typeof window.showSaveFilePicker === "function"){

            const handlePromise =
                window.showSaveFilePicker({

                    suggestedName: createBackupFileName(),

                    types: [
                        {
                            description: "推し活手帳バックアップ",
                            accept: {
                                "application/zip": [".zip"]
                            }
                        }
                    ]

                });

            saveHandle = await handlePromise;

        }

        if(message){
            message.textContent =
                "選択したデータと写真・動画を集めています...";
        }

        const zipBlob = await createGeneralBackup();

        if(message){
            message.textContent = "ファイルを保存しています...";
        }

        if(saveHandle){

            const writable = await saveHandle.createWritable();

            await writable.write(zipBlob);

            await writable.close();

        }else{

            let fileName = window.prompt(
                "保存するファイル名を入力してください。",
                createBackupFileName()
            );

            if(fileName === null){

                if(message){
                    message.textContent = "保存をキャンセルしました。";
                }

                return;

            }

            fileName = normalizeFileName(fileName);

            downloadBackup(zipBlob, fileName);

        }

        if(message){
            message.textContent =
                "バックアップの保存処理が完了しました。";
        }

        alert(
            "推し活・全般データバックアップの保存処理が完了しました。"
        );

    }catch(error){

        if(error.name === "AbortError"){

            if(message){
                message.textContent = "保存をキャンセルしました。";
            }

            return;

        }

        console.error("バックアップ保存エラー:", error);

        if(message){
            message.textContent =
                "バックアップに失敗しました：" + error.message;
        }

        alert(
            "バックアップに失敗しました。\n\n" +
            error.message
        );

    }finally{

        if(button){
            button.disabled = false;
            button.textContent = "💾 バックアップを保存";
        }

    }

};


/* =====================================================
   8. 起動時に選択画面を準備
===================================================== */

if(document.readyState === "loading"){

    document.addEventListener(
        "DOMContentLoaded",
        observeBackupButton
    );

}else{

    observeBackupButton();

}

})();
