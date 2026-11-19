
/* =========================================================
   推し活手帳
   バックアップ復元 UI
   第1段階：ZIP選択・検査
   ※この段階ではデータを書き換えない
========================================================= */

(function(){

    "use strict";

    let selectedBackupFile = null;
    let inspectedBackupData = null;
    let inspectionBusy = false;


    /* =====================================================
       メッセージ表示
    ===================================================== */

    function showMessage(message){

        const element =
            document.getElementById("restoreBackupMessage");

        if(element){
            element.textContent = message;
        }

    }


    /* =====================================================
       ZIP選択
       画面が後から読み込まれる場合にも対応
    ===================================================== */

    window.selectRestoreBackup = function(){

        const input =
            document.getElementById("restoreBackupFile");

        if(!input){
            showMessage(
                "バックアップ選択欄が見つかりません。設定画面のHTMLを確認してください。"
            );
            return;
        }

        // 選択のたびにイベントを設定
        input.onchange = async function(){

            const file =
                input.files && input.files[0];

            await inspectSelectedFile(file);

        };

        input.value = "";
        input.click();

    };


    /* =====================================================
       検査結果表示
    ===================================================== */

    function showInspectionResult(report){

        const area =
            document.getElementById(
                "restoreBackupInspection"
            );

        const result =
            document.getElementById(
                "restoreBackupInspectionResult"
            );

        const button =
            document.getElementById(
                "startRestoreBackupButton"
            );

        if(!area || !result){
            throw new Error(
                "検査結果の表示欄が見つかりません。"
            );
        }

        area.style.display = "block";

        if(button){
            button.disabled = true;
        }

        result.textContent = "";

        const items = [

            ["検査結果",
                report.valid ? "正常" : "異常"],

            ["ファイル名", report.filename],

            ["ファイル容量",
                (report.zipSize / 1024 / 1024).toFixed(2) + " MB"],

            ["メインデータ項目",
                report.mainDataItems.length + " 件"],

            ["localStorage項目",
                report.localStorageItems.length + " 件"],

            ["写真・動画",
                report.mediaCount + " 件"],

            ["ZIP内ファイル数",
                report.zipEntryCount + " 件"],

            ["CRC検査",
                report.checkedCRCCount + " 件"]

        ];

        const list = document.createElement("div");

        for(const item of items){

            const line = document.createElement("p");

            const label = document.createElement("strong");

            label.textContent = item[0] + "：";

            line.appendChild(label);

            line.appendChild(
                document.createTextNode(
                    String(item[1] ?? "")
                )
            );

            list.appendChild(line);

        }

        result.appendChild(list);

        const notice = document.createElement("p");

        notice.textContent =
            "ZIPの構造と内容を検査しました。アプリのデータは変更していません。";

        result.appendChild(notice);

    }


    /* =====================================================
       ファイル選択後の検査
    ===================================================== */

    async function inspectSelectedFile(file){

        if(inspectionBusy){
            return;
        }

        inspectionBusy = true;

        selectedBackupFile = null;
        inspectedBackupData = null;

        const area =
            document.getElementById(
                "restoreBackupInspection"
            );

        const result =
            document.getElementById(
                "restoreBackupInspectionResult"
            );

        const button =
            document.getElementById(
                "startRestoreBackupButton"
            );

        const fileName =
            document.getElementById(
                "restoreBackupFileName"
            );

        if(area){
            area.style.display = "none";
        }

        if(result){
            result.textContent = "";
        }

        if(button){
            button.disabled = true;
        }

        if(fileName){
            fileName.textContent = file
                ? "選択中：" + file.name
                : "";
        }

        try{

            if(!file){
                throw new Error(
                    "ファイルが選択されていません。"
                );
            }

            if(!file.name.toLowerCase().endsWith(".zip")){
                throw new Error(
                    "ZIPファイルを選択してください。"
                );
            }

            if(
                !window.BackupManager ||
                typeof BackupManager.inspectBackupFile !== "function"
            ){
                throw new Error(
                    "バックアップ検査機能が読み込まれていません。"
                );
            }

            showMessage(
                "バックアップZIPを検査しています..."
            );

            const inspected =
                await BackupManager.inspectBackupFile(file);

            if(
                !inspected ||
                !inspected.report ||
                inspected.report.valid !== true
            ){
                throw new Error(
                    "バックアップの検査に失敗しました。"
                );
            }

            selectedBackupFile = file;
            inspectedBackupData = inspected;

            showInspectionResult(inspected.report);

            showMessage(
                "ZIPの検査が完了しました。データの変更はありません。"
            );

        }catch(error){

            selectedBackupFile = null;
            inspectedBackupData = null;

            showMessage(
                "検査できませんでした：" +
                (error.message || String(error))
            );

            if(area){
                area.style.display = "none";
            }

            if(button){
                button.disabled = true;
            }

            console.error(
                "バックアップ検査エラー",
                error
            );

        }finally{

            inspectionBusy = false;

        }

    }


    /* =====================================================
       復元開始ボタン
       ※復元処理は次の段階で実装
    ===================================================== */

    window.startRestoreBackup = function(){

        if(!selectedBackupFile || !inspectedBackupData){
            showMessage(
                "先にバックアップZIPを選択して検査してください。"
            );
            return;
        }

        showMessage(
            "現在はZIPの検査まで実装済みです。データを変更する復元処理はまだ開始していません。"
        );

    };


})();
