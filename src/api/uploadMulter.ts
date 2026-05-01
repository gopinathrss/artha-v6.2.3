import multer from 'multer'
import os from 'os'
import path from 'path'

export const arthaUpload = multer({ dest: path.join(os.tmpdir(), 'artha-uploads') })
