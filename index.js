// # SimpleServer
// A simple chat bot server

var logger = require('morgan');
var http = require('http');
var https = require('https');
var bodyParser = require('body-parser');
var express = require('express');
var request = require('request');
const { resolve } = require('path');
var router = express();
var app = express();
require('dotenv').config()

app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({
    extended: false
}));

var server = http.createServer(app);
app.listen(process.env.PORT || 3000);

app.get('/', (req, res) => {
    res.send('Server còn sống (amen)');
});

app.get('/test', async (req, res) => {
    const text = req.query.text.trim();

    if(text.startsWith('Thông tin ')) {
        const city = removeAccents(text.replace('Thông tin ', ''));

        res.send(await getCovidInfo(city));
    }
});

app.get('/webhook', function(req, res) {
    // Parse the query params
    let mode = req.query['hub.mode'];
    let token = req.query['hub.verify_token'];
    let challenge = req.query['hub.challenge'];

    if (mode && token) {
        if (mode === 'subscribe' && token === process.env.FB_WEBHOOK_TOKEN) {
        
            // Responds with the challenge token from the request
            res.status(200).send(challenge);
        
        } else {
            res.sendStatus(403);
        }
    }
});

// Đoạn code xử lý khi có người nhắn tin cho bot
app.post('/webhook', function(req, res) {
    if (req.body.object === 'page') {
        req.body.entry.forEach(async function(entry) {
            var messaging = entry.messaging;
            for (var message of messaging) {
                var senderId = message.sender.id;
                if (message.message && message.message.text) { // Nếu người dùng gửi tin nhắn đến
                    var text = message.message.text.trim();

                    if(text.startsWith('Thông tin ')) {
                        const city = removeAccents(text.replace('Thông tin ', ''));
                        sendMessage(senderId, await getCovidInfo(city));
                    } else if(text == 'hi' || text == "hello") {
                        sendMessage(senderId, 'Xin Chào');
                    } else{
                        sendMessage(senderId, 'Xin lỗi, câu hỏi của bạn chưa có trong hệ thống, chúng tôi sẽ cập nhật sớm nhất.');
                    }
                }
            }
        });

        res.status(200).send('EVENT_RECEIVED');
    } else {
        res.sendStatus(404);
    }
});

// Gửi thông tin tới REST API để Bot tự trả lời
function sendMessage(senderId, message) {
    request({
        url: 'https://graph.facebook.com/v2.6/me/messages',
        qs: {
            access_token: process.env.FB_ACCESS_TOKEN,
        },
        method: 'POST',
        json: {
            recipient: {
                id: senderId
            },
            message: {
                text: message
            },
        }
    });
}

async function getCovidInfo(city) {
    const covidData = await getCovidData();
    const data = csvToJSON(covidData.toString());
    const cityData = data.find(item => item['ENGLISH'] === city);

    return cityData ? getCityMessage(cityData) : getMessage(data);
}

function getCityMessage(data) {
    var newCase = data['NHIỄM HÔM NAY'] || 0;
    var newCaseExternal = data['NHIỄM HÔM NAY NHẬP CẢNH'] || 0;

    var message = `Hôm nay ${data['TỈNH THÀNH']} có ${newCase} ca mắc mới. Trong đó ${newCase - newCaseExternal} trong nước và ${newCaseExternal} nhập cảnh.\n`;
    message += `- Tổng số ${data['TỔNG'] || 0} ca mắc \n`;
    message += `- Số người được chữa khỏi ${data['KHỎI'] || 0} \n`;
    message += data['SỐ NGÀY KHÔNG CÓ CA NHIỄM MỚI'] ? `- Số ngày không có ca nhiễm mới ${data['SỐ NGÀY KHÔNG CÓ CA NHIỄM MỚI']} ngày\n` : '';

    return message;
}

function sum(prev, next){
    return parseInt(prev) + parseInt(next);
}

function getMessage(data) {
    var newCase = data.map(item => item['NHIỄM HÔM NAY'] || 0).reduce(sum);
    var newCaseExternal = data.map(item => item['NHIỄM HÔM NAY NHẬP CẢNH'] || 0).reduce(sum);

    var message = `Hôm nay Việt Nam có ${newCase} ca nhiễm mới (${newCase - newCaseExternal} trong nước và ${newCaseExternal} nhập cảnh). Trong đó:\n`
    data.filter(city => city['NHIỄM HÔM NAY'])
        .forEach(city => {
            message += `- ${city['TỈNH THÀNH']} có ${city['NHIỄM HÔM NAY']} ca \n`;
        });

    return message;
}

function getCovidData() {
    return new Promise((resolve, reject) => {
        const url = 'https://vnexpress.net/microservice/sheet/type/covid19_2021_by_map';

        https.get(url, (resp) => {
            let chunks = [];
      
            resp.on('data', (chunk) => {
                chunks.push(chunk);
            });
      
            resp.on('end', () => {
                resolve(Buffer.concat(chunks));
            });
      
            }).on("error", (err) => {
                reject(err);
            });
    });
}

function csvToJSON(csv) {
    var lines = csv.split('\n');
    var result = [];
    var headers;
    lines[0] = lines[0].replace(/["']/g, "");
    headers = lines[0].split(",");

    for (var i = 1; i < lines.length; i++) {
        var obj = {};
        lines[i] = lines[i].replace(/["']/g, "");

        if(lines[i] == undefined || lines[i].trim() == "") {
            continue;
        }

        var words = lines[i].split(",");
        // var words = lines[i].split("\"");
        for(var j = 0; j < words.length; j++) {
            obj[headers[j]] = words[j];
        }

        result.push(obj);
    }

    return result;
}

function removeAccents(str) {
    var AccentsMap = [
        "aàảãáạăằẳẵắặâầẩẫấậ",
        "AÀẢÃÁẠĂẰẲẴẮẶÂẦẨẪẤẬ",
        "dđ", "DĐ",
        "eèẻẽéẹêềểễếệ",
        "EÈẺẼÉẸÊỀỂỄẾỆ",
        "iìỉĩíị",
        "IÌỈĨÍỊ",
        "oòỏõóọôồổỗốộơờởỡớợ",
        "OÒỎÕÓỌÔỒỔỖỐỘƠỜỞỠỚỢ",
        "uùủũúụưừửữứự",
        "UÙỦŨÚỤƯỪỬỮỨỰ",
        "yỳỷỹýỵ",
        "YỲỶỸÝỴ"
    ];

    for (var i=0; i<AccentsMap.length; i++) {
        var re = new RegExp('[' + AccentsMap[i].substr(1) + ']', 'g');
        var char = AccentsMap[i][0];
        str = str.replace(re, char);
    }

    return str;
  }
