const fs = require("fs"),
      readLine = require("readline"),
      p = require("path")
      com = require("commander");

const classDeclareReg = /\$\.Class\(([\w\.]+)s?\,/,
      anyMethodReg = /([\w_]*)(=?\s?\:\s?function\s?\([\w\s\,\\\/*\-\>\<\[\]]*\))\s?\{/,
      methodStr = "\\s?\:\\s?function\\s?\\(\\s?",
      endbracket = /[\s\t]+\}\,\s*(?!.)/,
      prop = /[\s\t]+(\w*)(?=\s?:)/;

const funcList = [
    "initializeOptions",
    "initializeViewOptions",
    "onInitState",
    "onInitFunctions",
    "onInitFilters"
];

// const PARENT_PATH = p.join(["D:", "ECOUNTCollection", "ECERP", "01 Master-SALE150924", "80 Contents", "WebResource", "Contents", "js", "widget_base_new"]);
const PARENT_PATH = p.join("C:", "Users", "fried", "Downloads" ,"replace");
const DEFAULT_PARENT = "ecount.control";

const TEMP_FILE = "tempfile";

const parentFuncList = [];
const parentFuncParam = {};

var parentName;
var parentPath;

com
    .version("0.0.1")
    .command("path [path]")
    .action(function(path, cmd) {
        getParentName(path);
    });

function getParentName(path) {
    const lineReader = readLine.createInterface({ input: fs.createReadStream(path) });
    const parentPathArr = [PARENT_PATH];

    lineReader.on("line", (line) => {
        let matched;

        if (matched = line.match(classDeclareReg)) {
            parentName =  matched[1];
            if (parentName == null || parentName == DEFAULT_PARENT) {
                parentPathArr.push(DEFAULT_PARENT + ".js");
            } else {
                parentPathArr.push(p.join([DEFAULT_PARENT, "control",  parentName + ".js"]));
            }

            lineReader.close();
        }
    });
    
    lineReader.on("close", () => {
        parentPath = parentPathArr.join(p.sep);
        console.log(parentPath);
        console.log("----------------------------end of finding parent");
        getParentMethodList(path);
    });

}

function getParentMethodList(path) {
    const lineReader = readLine.createInterface({ input: fs.createReadStream(parentPath) });

    lineReader.on("line", (line) => {
        let matched, funcName;
        
        if (matched = line.match(anyMethodReg)) {
            funcName = matched[1];

            if (!funcName.startsWith("_")) {
                parentFuncList.push(funcName);
                parentFuncParam[funcName] = line.substring(line.indexOf("("), line.indexOf("{"));
            }
        }
    });

    lineReader.on("close", () => {
        console.log("number of methods ===>" + parentFuncList.length);
        console.log("----------------------------end of finding parent methods");
        changeMethodName(path);
    });
}

function changeMethodName(path) {
    const lineReader = readLine.createInterface({ input: fs.createReadStream(path) });
    const tempFile = fs.openSync(TEMP_FILE, "w+");
    const findTargetMethodReg = new RegExp("(" + funcList.map(f => "(" + f + methodStr + ")").join("|") + ")");

    fs.writeFileSync(tempFile, new Buffer(8), null, "utf-8")
    lineReader.on("line", function (line) {
        let matched, newLine;
        if (matched = line.match(findTargetMethodReg)) {
            let funcName = matched.find((s, i) => i > 1 && s),
                indent = line.indexOf(funcName),
                prototypeCall = `\n${"\u0020".repeat(indent + 4)}${parentName}.prototype._${funcName}.apply(this, arguments)`;

                newLine = line.replace(funcName, "_" + funcName) + prototypeCall;
        } else {
            newLine = line;
        }

        fs.appendFileSync(tempFile, newLine + "\n", "utf-8");
    });
    
    lineReader.on("close", function() {
        console.log("----------------------------end of changing methodName");    
        addOmittedMethod(path);
    });
}

function addOmittedMethod(path) {
    let newName = path.split("."),
        ext = newName.pop(),
        newFile = fs.openSync(newName.join(".") + "_new." + ext, "w+"),
        insertPos, indent;

    fs.readFile(TEMP_FILE, "utf-8", (err, data) => {  
        if (err) { return console.log(err); }
                
        parentFuncList.forEach(funcName => {
            let matched, content,
                findTargetMethodReg = "(?<!\\w)(" + funcName + methodStr + ")";

            if (matched = data.match(findTargetMethodReg)) {
                insertPos = _findEndBracketPos(data.substring(matched.index)) + matched.index;
                insertPos = (data[insertPos + 1] == ",")? insertPos + 2 : insertPos + 1;
                before = data.substring(0, matched.index);
                indent = matched.index - before.lastIndexOf("\n") - 1;
            } else {
                firstFunc = data.match(anyMethodReg);
                if (!firstFunc) return;
                
                if (!insertPos) {  
                    insertPos = _findEndBracketPos(data.substring(firstFunc.index)) + firstFunc.index;
                    insertPos = (data[insertPos + 1] == ",")? insertPos + 2 : insertPos + 1;
                    before = data.substring(0, firstFunc.index);
                    indent = firstFunc.index - before.lastIndexOf("\n") - 1;
                }

                content = _getSuperCallFunctionStr(funcName, indent);
                data = [data.substring(0, insertPos), content, data.substring(insertPos)].join("");
                insertPos = insertPos + content.length;
            }
        });

        fs.writeFileSync(newFile, data, null, "utf-8")

        try {
            fs.unlinkSync(TEMP_FILE);
        } catch(err) {
            console.log(err);
        }
        console.log("----------------------------done");
    });

}

function _findEndBracketPos(str) {
    let funcStartBracketPassed = false;
    for (let i = 0, bracketStack = [], len = str.length, char; i < len; i++) {
        char = str[i];
        if (char == "{") {
            if (!funcStartBracketPassed) {
                funcStartBracketPassed = true;
            } else {
                bracketStack.push(i);
                continue;
            }
        }
        
        if (char == "}") {
            if (!bracketStack.length) return i;
            bracketStack.pop();
        }

    }
}

function _getSuperCallFunctionStr(funcName, indent) {
    return [
        `\n${"\u0020".repeat(indent)}`,
        `${funcName}: function ${parentFuncParam[funcName]} {`,
            `\n${"\u0020".repeat(indent + 4)}${parentName}.prototype.${funcName}.apply(this, arguments);`,
        `\n${"\u0020".repeat(indent)}},\n`
    ].join("");
}

com
    .parse(process.argv);
