module.exports = {
apps: [{
name: "yongan",
script: "dist/index.js",
cwd: "/var/www/yongan",
env: {
DATABASE_URL: "mysql://yongan:Yongan2024!@localhost:3306/yongan_dispatch",
OAUTH_SERVER_URL: "http://localhost:3000",
NODE_ENV: "production",
PORT: 3000
}
}]
}
