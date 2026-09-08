const fs = require('fs');
const path = require('path');

const filesToUpdate = [
    path.join(__dirname, 'frontend/src/pages/RegistrationForm.tsx'),
    path.join(__dirname, 'backend/src/controllers/StudentController.ts')
];

filesToUpdate.forEach(file => {
    if (fs.existsSync(file)) {
        let content = fs.readFileSync(file, 'utf8');
        let newContent = content
            .replace(/photo_base64/g, 'photo_url')
            .replace(/mother_birth_date/g, 'mother_birthdate')
            .replace(/landline_no/g, 'landline');
        
        if (content !== newContent) {
            fs.writeFileSync(file, newContent);
            console.log(`Updated ${file}`);
        } else {
            console.log(`No changes needed for ${file}`);
        }
    } else {
        console.log(`File not found: ${file}`);
    }
});
